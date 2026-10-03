export type MissionFilter = "all" | "WEB_STAGING" | "TESTFLIGHT" | "PLAY_STORE" | "high-bounty";
export type MissionSort = "reward" | "slots";

type DiscoverableMission = {
  title: string;
  description: string;
  targetVibe: string;
  platform: string;
  bountyPerTaskUsd: number;
  totalSlots: number;
  claimedSlots: number;
};

export function availableSlots(mission: Pick<DiscoverableMission, "totalSlots" | "claimedSlots">) {
  return Math.max(0, mission.totalSlots - mission.claimedSlots);
}

export function discoverMissions<T extends DiscoverableMission>(missions: T[], query: string, filter: MissionFilter, sort: MissionSort) {
  const search = query.trim().toLowerCase();
  return missions.filter((mission) => {
    const matchesSearch = `${mission.title} ${mission.description} ${mission.targetVibe}`.toLowerCase().includes(search);
    const matchesFilter = filter === "all"
      || (filter === "high-bounty" ? mission.bountyPerTaskUsd >= 5 : mission.platform === filter);
    return matchesSearch && matchesFilter;
  }).sort((a, b) => sort === "slots"
    ? availableSlots(b) - availableSlots(a) || b.bountyPerTaskUsd - a.bountyPerTaskUsd
    : b.bountyPerTaskUsd - a.bountyPerTaskUsd || availableSlots(b) - availableSlots(a));
}

export function approvalRate(approved: number, rejected: number) {
  const reviewed = approved + rejected;
  return reviewed === 0 ? null : Math.round((approved / reviewed) * 100);
}

export function testerMilestones(approved: number, reputation: number) {
  return [
    { name: "First signal", description: "Get your first mission approved.", current: approved, target: 1 },
    { name: "Reliable contributor", description: "Complete 5 approved missions.", current: approved, target: 5 },
    { name: "Launch partner", description: "Complete 25 approved missions.", current: approved, target: 25 },
    { name: "Core Validator", description: "Earn 1,500 reputation points.", current: reputation, target: 1500 },
  ].map((milestone) => ({
    ...milestone,
    earned: milestone.current >= milestone.target,
    percent: Math.min(100, Math.max(0, milestone.current / milestone.target * 100)),
  }));
}
