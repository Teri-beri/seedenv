"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export type DropdownAccount = {
  username: string;
  avatarUrl: string | null;
  organization: string | null;
  roleLabel: string;
  publicProfileHref: string | null;
};

const itemClass = "flex items-center px-3 py-1.5 rounded-lg transition-colors";
const workspaceLinks = [
  { label: "Launch Circle", href: "/community", mobileOnly: true },
  { label: "Tester Applications", href: "/applications" },
  { label: "Messages & Requests", href: "/messages" },
  { label: "Connections", href: "/account?tab=connections" },
  { label: "Clippers", href: "/clippers" },
] as const;

export function UserDropdown({ account }: { account: DropdownAccount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const initial = account.username.trim().charAt(0).toUpperCase() || "?";
  const dismiss = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Account menu for @${account.username}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid size-8 place-items-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 bg-cover bg-center text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600"
        style={account.avatarUrl ? { backgroundImage: `url(${JSON.stringify(account.avatarUrl)})` } : undefined}
      >
        {account.avatarUrl ? null : initial}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-zinc-800 bg-zinc-900 p-1 font-mono text-xs shadow-2xl shadow-black/50">
          <div className="border-b border-zinc-800/80 px-3 py-2">
            <div className="truncate font-semibold text-zinc-200">@{account.username}</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{account.organization ? `${account.organization} · ` : ""}{account.roleLabel}</div>
          </div>

          <div className="py-1">
            {account.publicProfileHref ? (
              <Link role="menuitem" href={account.publicProfileHref} onClick={dismiss} className={`${itemClass} justify-between text-zinc-300 hover:bg-zinc-800/70 hover:text-white`}>
                <span>Public Profile</span>
                <span className="text-[10px] text-zinc-500">↗</span>
              </Link>
            ) : (
              <Link role="menuitem" href="/account?tab=profile" onClick={dismiss} className={`${itemClass} justify-between text-zinc-300 hover:bg-zinc-800/70 hover:text-white`}>
                <span>Set Profile Handle</span>
                <span className="text-[10px] text-zinc-500">→</span>
              </Link>
            )}
            <Link role="menuitem" href="/account" onClick={dismiss} className={`${itemClass} text-zinc-300 hover:bg-zinc-800/70 hover:text-white`}>Account Settings</Link>
          </div>

          <div className="my-1 h-px bg-zinc-800" />

          <div className="py-1">
            {workspaceLinks.map((item) => (
              <Link key={item.href} role="menuitem" href={item.href} onClick={dismiss} className={`${itemClass} text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 ${"mobileOnly" in item ? "md:hidden" : ""}`}>{item.label}</Link>
            ))}
          </div>

          <div className="my-1 h-px bg-zinc-800" />

          <div className="py-1">
            <Link role="menuitem" href="/docs" onClick={dismiss} className={`${itemClass} text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200`}>Documentation &amp; API</Link>
            <Link role="menuitem" href="/status" onClick={dismiss} className={`${itemClass} text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200`}>System Status</Link>
          </div>

          <div className="my-1 h-px bg-zinc-800" />

          <div className="py-1">
            <button type="button" role="menuitem" onClick={() => signOut({ callbackUrl: "/auth/signin" })} className={`${itemClass} w-full text-left text-rose-400 hover:bg-rose-500/10 hover:text-rose-300`}>
              Sign Out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
