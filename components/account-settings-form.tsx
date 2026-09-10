"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { updateAccountSettings } from "@/app/actions/accountActions";
import { Button } from "@/components/ui/button";

type AccountSettingsFormProps = {
  initial: {
    name: string | null;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    portfolioUrl: string | null;
    companyName: string | null;
    productUrl: string | null;
    email: string;
    role: string;
  };
};

export function AccountSettingsForm({ initial }: AccountSettingsFormProps) {
  const [name, setName] = useState(initial.name || "");
  const [username, setUsername] = useState(initial.username);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl || "");
  const [bio, setBio] = useState(initial.bio || "");
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl || "");
  const [companyName, setCompanyName] = useState(initial.companyName || "");
  const [productUrl, setProductUrl] = useState(initial.productUrl || "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        await updateAccountSettings({ name, username, avatarUrl, bio, portfolioUrl, companyName, productUrl });
        setMessage("Account settings saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save account settings.");
      }
    });
  }

  return (
    <form className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md" onSubmit={submit}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-amber-500">Settings</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Account profile</h2>
        </div>
        <span className="rounded-full border border-violet-500/30 bg-violet-950/40 px-3 py-1 text-xs font-semibold text-violet-100">{initial.role}</span>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Email
          <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-neutral-500" disabled value={initial.email} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Display name
          <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setName(event.target.value)} placeholder="Your public display name" value={name} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Username
          <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setUsername(event.target.value)} placeholder="SeedEnv handle" required value={username} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Avatar URL
          <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." value={avatarUrl} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          {initial.role === "DEVELOPER" ? "Launch goals" : "Profile bio"}
          <textarea className="min-h-24 w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setBio(event.target.value)} placeholder="Describe your SeedEnv profile" value={bio} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Portfolio URL
          <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://..." type="url" value={portfolioUrl} />
        </label>
        {initial.role === "DEVELOPER" ? (
          <>
            <label className="space-y-2 text-sm font-semibold text-neutral-300">
              Company / Studio
              <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setCompanyName(event.target.value)} placeholder="Studio name" value={companyName} />
            </label>
            <label className="space-y-2 text-sm font-semibold text-neutral-300">
              Product URL
              <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setProductUrl(event.target.value)} placeholder="https://yourapp.com" type="url" value={productUrl} />
            </label>
          </>
        ) : null}
      </div>

      {message ? <p className={`mt-4 rounded-lg p-3 text-sm ${message.includes("saved") ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>{message}</p> : null}

      <Button className="mt-5 w-full" disabled={isPending} type="submit">
        <Save className="size-4" /> {isPending ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
