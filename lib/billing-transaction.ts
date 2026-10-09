import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Reconciliation reads paginated Stripe state before committing its accounting
// snapshot. Default Prisma's five-second interactive timeout is insufficient.
export async function billingTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 120000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}
