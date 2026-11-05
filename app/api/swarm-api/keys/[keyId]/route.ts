import { NextResponse } from "next/server";
import { revokeApiKey } from "@/lib/swarm-api/service";
import { noStore, requireSwarmMember, swarmErrorResponse } from "@/lib/swarm-api/session-route";

export async function DELETE(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const member = await requireSwarmMember(request);
  if ("response" in member) return member.response;
  const { keyId } = await params;
  try {
    await revokeApiKey(member.user.id, keyId);
    return NextResponse.json({ revoked: true }, { headers: noStore });
  } catch (error) {
    return swarmErrorResponse(error, "Could not revoke the API key.");
  }
}
