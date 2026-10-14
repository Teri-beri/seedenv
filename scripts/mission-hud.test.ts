import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";

test("mission pairing uses hashed expiring tokens and synchronizes owned submissions", async () => {
  let pairRow: Record<string, unknown> | null = null;
  let sessionUserId = "tester-1";
  const createdRows: Array<Record<string, unknown>> = [];
  const prisma = {
    submission: {
      findFirst: async () => ({ id: "submission-1", campaignId: "cohort-1", expiresAt: new Date(Date.now() + 86_400_000) }),
    },
    missionPairSession: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdRows.push(data);
        pairRow = {
          id: "pair-1",
          ...data,
          connectedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return pairRow;
      },
      findUnique: async () => pairRow ? {
        ...pairRow,
        submission: {
          testerId: "tester-1",
          status: "PENDING",
          expiresAt: pairRow.expiresAt,
        },
      } : null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        pairRow = { ...pairRow, ...data, updatedAt: new Date() };
        return pairRow;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };
  const modules = [
    mock.module("next-auth", { namedExports: { getServerSession: async () => ({ user: { id: sessionUserId, role: "TESTER" } }) } }),
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma } }),
  ];

  try {
    const [{ POST }, pairRoute] = await Promise.all([
      import("../app/api/mission-pair/route"),
      import("../app/api/mission-pair/[id]/route"),
    ]);
    const created = await POST(new Request("https://seedenv.example/api/mission-pair", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://seedenv.example", host: "seedenv.example" },
      body: JSON.stringify({ submissionId: "submission-1", activeStep: 1, completedSteps: [0], compact: true }),
    }));
    assert.equal(created.status, 201);
    const payload = await created.json() as { token: string; pairUrl: string; state: { submissionId: string; activeStep: number; completedSteps: number[]; compact: boolean } };
    assert.equal(payload.state.submissionId, "submission-1");
    assert.equal(payload.state.activeStep, 1);
    assert.deepEqual(payload.state.completedSteps, [0]);
    assert.equal(payload.state.compact, true);
    assert.equal(createdRows[0]?.testerId, "tester-1");
    assert.notEqual(createdRows[0]?.tokenHash, payload.token, "raw bearer tokens must never be stored");
    assert.match(String(createdRows[0]?.tokenHash), /^[a-f0-9]{64}$/);
    assert.match(payload.pairUrl, /#pair=pair-1&token=/);
    assert.doesNotMatch(payload.pairUrl.split("#")[0], /token=/, "the bearer token must stay out of server request logs");

    sessionUserId = "tester-2";
    const wrongOwner = await pairRoute.GET(new Request("https://seedenv.example/api/mission-pair/pair-1", { headers: { authorization: `Bearer ${payload.token}` } }), { params: Promise.resolve({ id: "pair-1" }) });
    assert.equal(wrongOwner.status, 404);
    sessionUserId = "tester-1";

    const invalid = await pairRoute.GET(new Request("https://seedenv.example/api/mission-pair/pair-1", { headers: { authorization: "Bearer wrong-token" } }), { params: Promise.resolve({ id: "pair-1" }) });
    assert.equal(invalid.status, 403);

    const connected = await pairRoute.GET(new Request("https://seedenv.example/api/mission-pair/pair-1?connect=1", { headers: { authorization: `Bearer ${payload.token}` } }), { params: Promise.resolve({ id: "pair-1" }) });
    assert.equal(connected.status, 200);
    assert.ok((await connected.json() as { state: { connectedAt: string | null } }).state.connectedAt);

    const currentPair = pairRow as Record<string, unknown> | null;
    assert.ok(currentPair);
    const validExpiry = currentPair.expiresAt;
    pairRow = { ...currentPair, expiresAt: new Date(Date.now() - 1_000) };
    const expired = await pairRoute.GET(new Request("https://seedenv.example/api/mission-pair/pair-1", { headers: { authorization: `Bearer ${payload.token}` } }), { params: Promise.resolve({ id: "pair-1" }) });
    assert.equal(expired.status, 410);
    pairRow = { ...currentPair, expiresAt: validExpiry };

    const updated = await pairRoute.PATCH(new Request("https://seedenv.example/api/mission-pair/pair-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://seedenv.example", host: "seedenv.example" },
      body: JSON.stringify({ token: payload.token, activeStep: 2, completedSteps: [1, 0, 1], compact: false }),
    }), { params: Promise.resolve({ id: "pair-1" }) });
    assert.equal(updated.status, 200);
    const updatedPayload = await updated.json() as { state: { activeStep: number; completedSteps: number[] } };
    assert.equal(updatedPayload.state.activeStep, 2);
    assert.deepEqual(updatedPayload.state.completedSteps, [0, 1]);
  } finally {
    modules.reverse().forEach((item) => item.restore());
  }
});

test("mission HUD uses real QR payloads, complete compact steps, and spring odometer feedback", async () => {
  const [pairing, conductor, reward, experience] = await Promise.all([
    readFile("components/tester/PairingModal.tsx", "utf8"),
    readFile("components/tester/MissionConductor.tsx", "utf8"),
    readFile("components/tester/RewardModal.tsx", "utf8"),
    readFile("components/mission-experience.tsx", "utf8"),
  ]);

  assert.match(pairing, /QRCode\.toDataURL\(payload\.pairUrl/);
  assert.doesNotMatch(pairing, /buildQrMatrix|SEEDENV-PAIR-42/);
  assert.match(conductor, /steps\.map\(\(step, index\)/);
  assert.match(conductor, /navigator\.vibrate\(35\)/);
  assert.match(conductor, /createOscillator/);
  assert.match(reward, /useMotionValue/);
  assert.match(reward, /useSpring/);
  assert.match(reward, /useMotionValueEvent/);
  assert.match(reward, /Array\.from\(\{ length: 10 \}/);
  assert.match(experience, /import\("pusher-js"\)/);
  assert.match(experience, /window\.setInterval\(\(\) => void poll\(\), 3_000\)/);
  assert.match(experience, /collectHardwareSignals/);
  assert.doesNotMatch(experience, /triggerHaptic\(\);\s*triggerCompletionTone\(\);\s*setProofSubmitted/);
});
