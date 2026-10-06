"use client";

import Image from "next/image";
import { BadgeCheck, GitBranch, ImagePlus, Link2, Save } from "lucide-react";
import Link from "next/link";
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
    githubUsername: string | null;
    discordUrl: string | null;
    twitterHandle: string | null;
    emailVerified: boolean;
    githubConnected: boolean;
    email: string;
    role: string;
  };
};

export function AccountSettingsForm({ initial }: AccountSettingsFormProps) {
  const [name, setName] = useState(initial.name || "");
  const [username, setUsername] = useState(initial.username);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl || "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [bio, setBio] = useState(initial.bio || "");
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl || "");
  const [companyName, setCompanyName] = useState(initial.companyName || "");
  const [productUrl, setProductUrl] = useState(initial.productUrl || "");
  const [githubUsername, setGithubUsername] = useState(initial.githubUsername || "");
  const [discordUrl, setDiscordUrl] = useState(initial.discordUrl || "");
  const [twitterHandle, setTwitterHandle] = useState(initial.twitterHandle || "");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await updateAccountSettings({ name, username, avatarUrl, bio, portfolioUrl, companyName, productUrl, githubUsername, discordUrl, twitterHandle });
        if (!result.ok) {
          setFieldErrors(result.fieldErrors || {});
          setMessage(result.message);
          return;
        }
        setMessage("Account settings saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save account settings.");
      }
    });
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!(file.type === "image/png" || file.type === "image/jpeg")) {
      setAvatarMessage("Choose a PNG or JPG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMessage("Image must be 2 MB or smaller.");
      return;
    }

    setAvatarMessage("");
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/account/avatar", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not upload this image.");
      setAvatarUrl(result.avatarUrl);
      setAvatarFailed(false);
      setAvatarMessage("Image uploaded. Save settings to apply it.");
    } catch (error) {
      setAvatarMessage(error instanceof Error ? error.message : "Could not upload this image.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || username.slice(0, 2).toUpperCase() || "SE";
  const inputClass = "w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20";

  function fieldError(field: string) {
    return fieldErrors[field] ? <p className="mt-1 text-xs font-normal text-red-300" id={`${field}-error`}>{fieldErrors[field]}</p> : null;
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

      <div className="mt-5 grid grid-cols-1 gap-4">
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Email
          <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-neutral-500" disabled value={initial.email} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Display name
          <input aria-describedby={fieldErrors.name ? "name-error" : undefined} aria-invalid={Boolean(fieldErrors.name)} className={inputClass} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Your public display name" value={name} />
          {fieldError("name")}
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Username
          <input aria-describedby={fieldErrors.username ? "username-error" : undefined} aria-invalid={Boolean(fieldErrors.username)} className={inputClass} maxLength={32} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9_]{3,32}" placeholder="SeedEnv handle" required value={username} />
          {fieldError("username")}
        </label>
        <div className="space-y-2 text-sm font-semibold text-neutral-300">
          <p>Profile photo</p>
          <div className="flex items-center gap-4">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-full border border-[#2A2F3D] bg-[#090A0F]">
              {avatarUrl && !avatarFailed ? <Image alt="Profile photo preview" className="object-cover" fill onError={() => setAvatarFailed(true)} sizes="56px" src={avatarUrl} unoptimized /> : <span className="grid size-full place-items-center bg-gradient-to-br from-amber-500/30 to-emerald-500/20 text-sm font-black text-amber-100">{initials}</span>}
            </span>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-sm font-semibold text-neutral-200 transition hover:border-amber-500/40 hover:text-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <ImagePlus className="size-4" /> {isUploadingAvatar ? "Uploading..." : "Choose PNG or JPG"}
              <input accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="sr-only" disabled={isUploadingAvatar} onChange={uploadAvatar} type="file" />
            </label>
          </div>
          <p className="text-xs font-normal text-neutral-500">PNG or JPG, up to 2 MB.</p>
          {avatarMessage ? <p className={`text-xs font-normal ${avatarMessage.startsWith("Image uploaded") ? "text-emerald-300" : "text-red-300"}`} role="status">{avatarMessage}</p> : null}
        </div>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          {initial.role === "DEVELOPER" ? "Launch goals" : "Profile bio"}
          <textarea aria-describedby={fieldErrors.bio ? "bio-error" : undefined} aria-invalid={Boolean(fieldErrors.bio)} className={`${inputClass} min-h-24`} maxLength={200} onChange={(event) => setBio(event.target.value)} placeholder="Describe your SeedEnv profile" value={bio} />
          <span className="block text-right text-xs font-normal text-neutral-500">{bio.length}/200</span>
          {fieldError("bio")}
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          GitHub username
          <span className="relative block">
            <GitBranch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
            <input aria-describedby={fieldErrors.githubUsername ? "githubUsername-error" : undefined} aria-invalid={Boolean(fieldErrors.githubUsername)} className={`${inputClass} pl-10`} maxLength={39} onChange={(event) => setGithubUsername(event.target.value)} placeholder="octocat" value={githubUsername} />
          </span>
          {fieldError("githubUsername")}
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Discord server / community URL
          <input aria-describedby={fieldErrors.discordUrl ? "discordUrl-error" : undefined} aria-invalid={Boolean(fieldErrors.discordUrl)} className={inputClass} onChange={(event) => setDiscordUrl(event.target.value)} placeholder="https://discord.gg/..." type="url" value={discordUrl} />
          {fieldError("discordUrl")}
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          X / Twitter handle
          <input aria-describedby={fieldErrors.twitterHandle ? "twitterHandle-error" : undefined} aria-invalid={Boolean(fieldErrors.twitterHandle)} className={inputClass} maxLength={16} onChange={(event) => setTwitterHandle(event.target.value)} placeholder="@yourhandle" value={twitterHandle} />
          {fieldError("twitterHandle")}
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Portfolio URL
          <input aria-describedby={fieldErrors.portfolioUrl ? "portfolioUrl-error" : undefined} aria-invalid={Boolean(fieldErrors.portfolioUrl)} className={inputClass} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://..." type="url" value={portfolioUrl} />
          {fieldError("portfolioUrl")}
        </label>
        {initial.role === "DEVELOPER" ? (
          <>
            <label className="space-y-2 text-sm font-semibold text-neutral-300">
              Company / Studio
              <input aria-describedby={fieldErrors.companyName ? "companyName-error" : undefined} aria-invalid={Boolean(fieldErrors.companyName)} className={inputClass} maxLength={100} onChange={(event) => setCompanyName(event.target.value)} placeholder="Studio name" value={companyName} />
              {fieldError("companyName")}
            </label>
            <label className="space-y-2 text-sm font-semibold text-neutral-300">
              Product URL
              <input aria-describedby={fieldErrors.productUrl ? "productUrl-error" : undefined} aria-invalid={Boolean(fieldErrors.productUrl)} className={inputClass} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://yourapp.com" type="url" value={productUrl} />
              {fieldError("productUrl")}
            </label>
          </>
        ) : null}
      </div>

      {initial.role === "DEVELOPER" ? (
        <section className="mt-5 rounded-xl border border-[#1F2430] bg-[#090A0F]/70 p-4" aria-label="Developer profile preview">
          <div className="flex items-center gap-3">
            <span className="relative size-11 shrink-0 overflow-hidden rounded-full border border-amber-500/30 bg-amber-500/10">
              {avatarUrl && !avatarFailed ? <Image alt="Developer avatar preview" className="object-cover" fill onError={() => setAvatarFailed(true)} sizes="44px" src={avatarUrl} unoptimized /> : <span className="grid size-full place-items-center text-sm font-bold text-amber-100">{initials}</span>}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-white">{name || "Developer name"}</p>
              <p className="truncate text-xs text-neutral-500">{companyName || "Studio / company"} · @{username || "username"}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-5 text-neutral-400">{bio || "Your developer bio will appear here."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {initial.emailVerified ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-300"><BadgeCheck className="size-3.5" /> Email verified</span> : null}
            {initial.githubConnected ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-300"><BadgeCheck className="size-3.5" /> GitHub connected</span> : null}
            {githubUsername ? <Link className="inline-flex items-center gap-1 rounded-full border border-[#2A2F3D] px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500/40" href={`https://github.com/${githubUsername}`} target="_blank" rel="noreferrer"><GitBranch className="size-3.5" /> GitHub</Link> : null}
            {discordUrl ? <Link className="inline-flex items-center gap-1 rounded-full border border-[#2A2F3D] px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500/40" href={discordUrl} target="_blank" rel="noreferrer"><Link2 className="size-3.5" /> Discord</Link> : null}
            {twitterHandle ? <Link className="inline-flex items-center gap-1 rounded-full border border-[#2A2F3D] px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500/40" href={`https://x.com/${twitterHandle.replace(/^@/, "")}`} target="_blank" rel="noreferrer">X / Twitter</Link> : null}
            {productUrl ? <Link className="inline-flex items-center gap-1 rounded-full border border-[#2A2F3D] px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500/40" href={productUrl} target="_blank" rel="noreferrer"><Link2 className="size-3.5" /> Product link</Link> : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-neutral-500">Social and product links are shown as entered. Only email and connected GitHub sign-in are marked verified.</p>
        </section>
      ) : null}

      {message ? <p className={`mt-4 rounded-lg p-3 text-sm ${message.includes("saved") ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`} role={fieldErrors && Object.keys(fieldErrors).length ? "alert" : "status"}>{message}</p> : null}

      <Button className="mt-5 w-full" disabled={isPending || isUploadingAvatar} type="submit">
        <Save className="size-4" /> {isUploadingAvatar ? "Uploading photo..." : isPending ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
