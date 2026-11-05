import { NextResponse } from "next/server";
import { createApiKey } from "@/lib/swarm-api/service";
import { noStore, readJson, requireSwarmMember, swarmErrorResponse } from "@/lib/swarm-api/session-route";

export async function POST(request: Request) {
  const member = await requireSwarmMember(request);
  if ("response" in member) return member.response;
  const body = await readJson(request);
  try {
    const key = await createApiKey(member.user.id, typeof body.name === "string" ? body.name : "");
    return NextResponse.json({ key: { ...key, createdAt: key.createdAt.toISOString() } }, { status: 201, headers: noStore });
  } catch (error) {
    return swarmErrorResponse(error, "Could not create the API key.");
  }
}
