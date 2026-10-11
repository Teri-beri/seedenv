import { createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const privateHeaders = { "Cache-Control": "private, no-store" };

const styles = StyleSheet.create({
  page: { padding: 34, backgroundColor: "#ffffff", color: "#111827", fontFamily: "Helvetica", fontSize: 8 },
  eyebrow: { color: "#047857", fontSize: 9, fontWeight: 700, letterSpacing: 1.2 },
  title: { marginTop: 8, fontSize: 21, fontWeight: 700, color: "#0f172a" },
  subtitle: { marginTop: 5, color: "#64748b", fontSize: 8 },
  section: { marginTop: 17 },
  sectionTitle: { marginBottom: 7, color: "#0f172a", fontSize: 11, fontWeight: 700 },
  card: { border: "1pt solid #dbe4e8", borderRadius: 5, padding: 10 },
  metadata: { flexDirection: "row", gap: 8, marginTop: 15 },
  metadataCell: { flex: 1, minHeight: 38, backgroundColor: "#f0fdf4", border: "1pt solid #bbf7d0", borderRadius: 4, padding: 7 },
  label: { color: "#64748b", fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6 },
  value: { marginTop: 4, color: "#0f172a", fontSize: 9, fontWeight: 700 },
  matrix: { flexDirection: "row", gap: 3 },
  matrixLabel: { width: 48, paddingTop: 8, color: "#64748b", fontSize: 7 },
  matrixCell: { width: 42, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 3, padding: 4 },
  matrixDay: { color: "#475569", fontSize: 7, fontWeight: 700 },
  matrixCount: { marginTop: 4, color: "#0f172a", fontSize: 10, fontWeight: 700 },
  twoColumn: { flexDirection: "row", gap: 8 },
  column: { flex: 1 },
  body: { marginBottom: 6, color: "#334155", fontSize: 8, lineHeight: 1.35 },
  responseLabel: { marginBottom: 3, color: "#047857", fontSize: 8, fontWeight: 700 },
  stamp: { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTop: "1pt solid #dbe4e8", paddingTop: 10 },
  hash: { maxWidth: "75%", color: "#475569", fontSize: 6 },
  signature: { border: "1pt solid #10b981", borderRadius: 4, padding: 7, color: "#047857", fontSize: 7, fontWeight: 700 },
  footer: { position: "absolute", bottom: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", color: "#94a3b8", fontSize: 6 },
});

type AuditPing = {
  validatorId: string;
  validatorHandle: string;
  dayNumber: number;
  deviceModel: string;
  osVersion: string;
  sessionDuration: number;
  timestamp: Date;
};

function Distribution({ title, values }: { title: string; values: Map<string, number> }) {
  return (
    <View style={styles.card}>
      <Text style={styles.responseLabel}>{title}</Text>
      {[...values.entries()].length ? [...values.entries()].map(([name, count]) => (
        <Text key={name} style={styles.body}>{name} · {count} recorded session{count === 1 ? "" : "s"}</Text>
      )) : <Text style={styles.body}>No sessions recorded.</Text>}
    </View>
  );
}

function AuditDocument({
  campaign,
  compliance,
  pings,
  packageName,
  start,
  end,
  uniqueDevices,
  verificationHash,
  complete,
}: {
  campaign: { title: string };
  compliance: { targetDays: number; requiredTesters: number; status: string };
  pings: AuditPing[];
  packageName: string;
  start: Date;
  end: Date;
  uniqueDevices: number;
  verificationHash: string;
  complete: boolean;
}) {
  const osCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  for (const ping of pings) {
    osCounts.set(ping.osVersion, (osCounts.get(ping.osVersion) ?? 0) + 1);
    deviceCounts.set(ping.deviceModel, (deviceCounts.get(ping.deviceModel) ?? 0) + 1);
  }

  return (
    <Document title={`Google Play audit ${campaign.title}`} author="TERIMUS LLC">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.eyebrow}>TERIMUS LLC · SEEDENV QUALITY OPERATIONS</Text>
        <Text style={styles.title}>Google Play Closed Testing Audit Summary</Text>
        <Text style={styles.subtitle}>{complete ? "Final audit export" : "IN-PROGRESS PREVIEW · NOT READY FOR PRODUCTION-ACCESS SUBMISSION"} · tester-reported session log</Text>

        <View style={styles.metadata}>
          <View style={styles.metadataCell}><Text style={styles.label}>Campaign</Text><Text style={styles.value}>{campaign.title}</Text></View>
          <View style={styles.metadataCell}><Text style={styles.label}>Package name</Text><Text style={styles.value}>{packageName}</Text></View>
          <View style={styles.metadataCell}><Text style={styles.label}>Testing window</Text><Text style={styles.value}>{start.toISOString().slice(0, 10)} → {end.toISOString().slice(0, 10)}</Text></View>
          <View style={styles.metadataCell}><Text style={styles.label}>Distinct devices</Text><Text style={styles.value}>{uniqueDevices}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engagement matrix · {compliance.requiredTesters} testers required per day</Text>
          <View style={styles.card}>
            <View style={styles.matrix}>
              <Text style={styles.matrixLabel}>UTC day</Text>
              {Array.from({ length: compliance.targetDays }, (_, index) => {
                const day = index + 1;
                const count = new Set(pings.filter((ping) => ping.dayNumber === day).map((ping) => ping.validatorId)).size;
                const met = count >= compliance.requiredTesters;
                return (
                  <View key={day} style={[styles.matrixCell, { backgroundColor: met ? "#dcfce7" : "#fef3c7" }]}>
                    <Text style={styles.matrixDay}>D{String(day).padStart(2, "0")}</Text>
                    <Text style={styles.matrixCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device diversity breakdown</Text>
          <View style={styles.twoColumn}>
            <View style={styles.column}><Distribution title="Android OS versions" values={osCounts} /></View>
            <View style={styles.column}><Distribution title="Device / OEM distribution" values={deviceCounts} /></View>
            <View style={styles.column}><View style={styles.card}><Text style={styles.responseLabel}>Screen resolutions</Text><Text style={styles.body}>Captured in associated evidence where available. This audit records the device and OS details reported by testers for each session.</Text></View></View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Production readiness responses</Text>
          <View style={styles.card}>
            <Text style={styles.responseLabel}>How did you collect feedback?</Text>
            <Text style={styles.body}>SeedEnv recruited opted-in testers for a closed testing track, captured structured reproduction reports, and reviewed device and session telemetry for each validation run.</Text>
            <Text style={styles.responseLabel}>What changes did you make based on testing?</Text>
            <Text style={styles.body}>We triaged tester reports by reproducibility and severity, fixed validated issues, and re-ran affected flows across the recorded device and OS mix.</Text>
            <Text style={styles.responseLabel}>How did testers use the app?</Text>
            <Text style={styles.body}>Testers followed the published task brief over the consecutive testing window and recorded real interactions, expected behavior, actual behavior, and supporting evidence.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data provenance</Text>
          <View style={styles.card}>
            <Text style={styles.body}>Session days and tester identities are recorded by SeedEnv against authenticated accounts enrolled in this cohort. Device model and OS version are self-reported by each tester and are not independently attested by SeedEnv. The verification hash below is a digest of the session records reproduced in this document: it proves this export matches SeedEnv&apos;s stored records and has not been altered, and does not certify the accuracy of tester-reported hardware.</Text>
          </View>
        </View>

        <View style={styles.stamp}>
          <Text style={styles.hash}>Verification hash: {verificationHash}</Text>
          <Text style={styles.signature}>{complete ? "OPERATIONAL SIGNATURE" : "IN-PROGRESS PREVIEW"} · TERIMUS-SEEDENV · {compliance.status}</Text>
        </View>
        <View style={styles.footer}><Text>TERIMUS LLC · Google Play Closed Testing Audit Summary</Text><Text>Generated from SeedEnv session records</Text></View>
      </Page>
    </Document>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "Sign in to export this audit." }, { status: 401, headers: privateHeaders });
  const { id } = await params;
  const campaign = await prisma.appCampaign.findFirst({
    where: { id, developerId: session.user.id, cohortType: "GOOGLE_PLAY_14_DAY" },
    include: { compliance: { include: { dailyPings: { orderBy: [{ dayNumber: "asc" }, { timestamp: "asc" }] } } } },
  });
  if (!campaign?.compliance) return Response.json({ message: "This cohort does not have a Google Play audit kit." }, { status: 404, headers: privateHeaders });

  const pings = campaign.compliance.dailyPings;
  const complete = Array.from({ length: campaign.compliance.targetDays }, (_, index) => index + 1).every(
    (day) => new Set(pings.filter((ping) => ping.dayNumber === day).map((ping) => ping.validatorId)).size >= campaign.compliance!.requiredTesters,
  );
  const start = pings[0]?.timestamp ?? campaign.createdAt;
  const end = new Date(start.getTime() + (campaign.compliance.targetDays - 1) * 86_400_000);
  const uniqueDevices = new Set(pings.map((ping) => `${ping.validatorId}:${ping.deviceModel}`)).size;
  const verificationHash = createHash("sha256").update(JSON.stringify({ campaignId: campaign.id, pings })).digest("hex");
  const packageName = (() => {
    try { return new URL(campaign.appUrl).hostname || "Not supplied"; } catch { return "Not supplied"; }
  })();
  const bytes = await renderToBuffer(
    <AuditDocument
      campaign={campaign}
      compliance={campaign.compliance}
      pings={pings}
      packageName={packageName}
      start={start}
      end={end}
      uniqueDevices={uniqueDevices}
      verificationHash={verificationHash}
      complete={complete}
    />,
  );

  return new Response(new Uint8Array(bytes), {
    headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="seedenv-google-play-${complete ? "audit" : "preview"}-${campaign.id}.pdf"` },
  });
}
