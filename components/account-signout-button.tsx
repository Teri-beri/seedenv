"use client";

import { LogOut, LoaderCircle } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function AccountSignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className="shrink-0"
      disabled={isPending}
      onClick={() => startTransition(async () => { await signOut({ callbackUrl: "/auth/signin" }); })}
      type="button"
      variant="ghost"
    >
      {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}