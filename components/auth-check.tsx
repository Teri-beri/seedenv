"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

interface AuthCheckProps {
  children: ReactNode;
  role?: "TESTER" | "DEVELOPER";
}

export default function AuthCheck({ children, role }: AuthCheckProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    if (role && session?.user.role !== role) {
      console.warn(`Access denied. Role required: ${role}. Your role: ${session?.user.role}`);
      router.push("/");
    }
  }, [status, session, role, router]);

  if (status === "loading" || (role && session?.user.role !== role)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090A0F] text-white">
        <div className="text-center">
          <svg className="mx-auto mb-6 size-10 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
          </svg>
          <p className="text-lg text-neutral-400">Verifying your SeedEnv 2FA session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
