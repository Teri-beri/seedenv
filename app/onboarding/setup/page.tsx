import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { GridBackground } from "@/components/grid-background";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const allowedNextPaths = ["/dashboard", "/console", "/admin", "/account"];

function cleanNextPath(value: string | undefined, fallback: string) {
  if (!value?.startsWith("/")) return fallback;
  return allowedNextPaths.some((path) => value === path || value.startsWith(`${path}?`)) ? value : fallback;
}

export default async function OnboardingSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/onboarding/setup");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, username: true, bio: true, portfolioUrl: true, companyName: true, productUrl: true, role: true, passwordHash: true },
  });
  if (!user) redirect("/auth/signin?callbackUrl=/onboarding/setup");

  const params = await searchParams;
  const fallback = user.role === "DEVELOPER" ? "/console?view=new-drop" : user.role === "ADMIN" ? "/admin" : "/dashboard";
  const nextPath = cleanNextPath(params.next, fallback);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[linear-gradient(180deg,#090A0F_0%,#0D1018_50%,#090A0F_100%)] px-4 py-10 text-white sm:py-12">
      <GridBackground staticOnly />
      <div className="relative z-10 w-full max-w-2xl">
        <OnboardingWizard
          hasPassword={Boolean(user.passwordHash)}
          initial={{
            email: user.email,
            name: user.name || "",
            username: user.username === "SeedEnv Member" ? "" : user.username,
            bio: user.bio || "",
            portfolioUrl: user.portfolioUrl || "",
            companyName: user.companyName || "",
            productUrl: user.productUrl || "",
            role: user.role,
          }}
          nextPath={nextPath}
        />
      </div>
    </main>
  );
}
