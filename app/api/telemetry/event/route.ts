import { IncidentSeverity, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { dispatchCriticalIncidentAlert } from "@/lib/telemetry/incident-alert";
import { resolveIncidentSeverity } from "@/lib/telemetry/thresholds";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 64 * 1024;
const INCIDENTS_PER_TEN_MINUTES = 60;

const incidentSchema = z.object({
  cohortId: z.string().min(1).max(100),
  severity: z.enum([IncidentSeverity.WARN, IncidentSeverity.CRITICAL]),
  statusCode: z.string().trim().min(1).max(64),
  endpoint: z.string().trim().max(300).optional().or(z.literal("")),
  deviceModel: z.string().trim().min(2).max(120),
  osVersion: z.string().trim().min(1).max(120),
  message: z.string().trim().min(4).max(1000),
  payloadSnapshot: z.json().optional(),
}).strict();

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site telemetry writes are not allowed." }, { status: 403, headers: responseHeaders });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Telemetry payload exceeds 64KB." }, { status: 413, headers: responseHeaders });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !["TESTER", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Sign in as an accepted tester to report telemetry." }, { status: 401, headers: responseHeaders });
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "Telemetry payload exceeds 64KB." }, { status: 413, headers: responseHeaders });
    rawBody = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Provide a valid JSON telemetry payload." }, { status: 400, headers: responseHeaders });
  }
  const parsed = incidentSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid telemetry payload." }, { status: 400, headers: responseHeaders });
  const input = parsed.data;
  const severity = resolveIncidentSeverity({ requestedSeverity: input.severity, statusCode: input.statusCode, payloadSnapshot: input.payloadSnapshot });
  const now = new Date();

  const cohort = await prisma.appCampaign.findFirst({
    where: {
      id: input.cohortId,
      status: { in: ["ACTIVE", "PAUSED"] },
      OR: [
        { submissions: { some: { testerId: session.user.id, status: "PENDING" } } },
        { applications: { some: { testerId: session.user.id, OR: [{ status: "STARTED" }, { status: "ACCEPTED", startBy: { gt: now } }] } } },
      ],
    },
    select: { id: true },
  });
  if (!cohort) return NextResponse.json({ error: "No active testing session grants access to this cohort." }, { status: 403, headers: responseHeaders });

  const windowStart = new Date(now.getTime() - 10 * 60 * 1000);
  const recentCount = await prisma.telemetryIncident.count({ where: { cohortId: cohort.id, validatorId: session.user.id, createdAt: { gte: windowStart } } });
  if (recentCount >= INCIDENTS_PER_TEN_MINUTES) return NextResponse.json({ error: "Telemetry rate limit reached. Retry after the current ten-minute window." }, { status: 429, headers: responseHeaders });

  const duplicate = await prisma.telemetryIncident.findFirst({
    where: {
      cohortId: cohort.id,
      validatorId: session.user.id,
      severity,
      statusCode: input.statusCode,
      endpoint: input.endpoint || null,
      message: input.message,
      createdAt: { gte: new Date(now.getTime() - 30_000) },
    },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ success: true, incidentId: duplicate.id, deduplicated: true }, { status: 200, headers: responseHeaders });

  const payloadSnapshot = input.payloadSnapshot === undefined
    ? undefined
    : input.payloadSnapshot === null ? Prisma.JsonNull : input.payloadSnapshot;
  const incident = await prisma.telemetryIncident.create({
    data: {
      cohortId: cohort.id,
      validatorId: session.user.id,
      severity,
      statusCode: input.statusCode,
      endpoint: input.endpoint || null,
      deviceModel: input.deviceModel,
      osVersion: input.osVersion,
      message: input.message,
      payloadSnapshot,
    },
    select: { id: true },
  });
  if (severity === IncidentSeverity.CRITICAL) {
    after(() => dispatchCriticalIncidentAlert(incident.id).catch((error) => {
      console.warn("SeedEnv critical incident alert failed:", incident.id, error instanceof Error ? error.message : error);
    }));
  }
  return NextResponse.json({ success: true, incidentId: incident.id, severity }, { status: 201, headers: responseHeaders });
}
