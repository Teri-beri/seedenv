import { loadGrowthConfig } from "@/lib/growth/config";
import { createGrowthContext } from "@/lib/growth/pipeline";
import { prismaGrowthStore } from "@/lib/growth/store";
import { prisma } from "@/lib/prisma";

export function productionGrowthContext() {
  const config = loadGrowthConfig();
  return createGrowthContext({ config, store: prismaGrowthStore(prisma) });
}
