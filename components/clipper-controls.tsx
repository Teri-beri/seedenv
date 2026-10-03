"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClipUpload, completeClipUpload } from "@/app/actions/clipperActions";

export const clipInputClass = "mt-2 block w-full min-w-0 rounded-xl border border-stroke bg-background p-3 text-base";

export function ClipperForm({ action, children, label, disabled = false }: { action: (data: FormData) => Promise<string>; children: React.ReactNode; label: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      try { setMessage(await action(data)); router.refresh(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "The action failed. Please retry."); }
    });
  }}>
    {children}
    <button type="submit" disabled={pending || disabled} className="min-h-11 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50">{pending ? "Working..." : label}</button>
    {message ? <p role="status" className="break-words text-sm leading-6 text-neutral-300">{message}</p> : null}
  </form>;
}

export function ClipRoomRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  return <p className="text-xs text-neutral-500">Room refreshes every 15 seconds while visible. Drafts and publication evidence are private to each creator and the developer.</p>;
}

function uploadFile(url: string, file: File, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = 600000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error("Upload connection failed. Check your network and retry."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Use a smaller video or retry on a stable connection."));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}).`));
    xhr.send(file);
  });
}

export function ClipUpload({ campaignId, engagementId, kind, enabled, onComplete }: { campaignId: string; engagementId?: string; kind: "BRIEF" | "DRAFT" | "PROOF"; enabled: boolean; onComplete?: (assetId: string) => Promise<string> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  return <ClipperForm label={kind === "DRAFT" ? "Upload & submit new video version" : kind === "PROOF" ? "Upload publication screenshot" : "Share brief asset"} disabled={!enabled} action={async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) throw new Error("Choose a file first.");
    if (!file.size || file.size > (file.type.startsWith("image/") ? 10 : 50) * 1024 * 1024) throw new Error("Images must be under 10MB; videos under 50MB.");
    const allowed = ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"] as const;
    const mimeType = allowed.find((mime) => mime === file.type);
    if (!mimeType) throw new Error("Choose a PNG, JPEG, WebP, MP4, WebM, or MOV file.");
    setProgress(0);
    const upload = await createClipUpload({ campaignId, engagementId, kind, name: file.name, mimeType, sizeBytes: file.size });
    await uploadFile(upload.uploadUrl, file, setProgress);
    const id = await completeClipUpload(upload.assetId);
    const message = onComplete ? await onComplete(id) : "Private asset uploaded.";
    if (fileRef.current) fileRef.current.value = "";
    return message;
  }}>
    <label className="block text-sm">{kind === "DRAFT" ? "Clean video file (MP4, WebM, MOV)" : kind === "PROOF" ? "Public post / account evidence screenshot" : "Reference image or video"}<input required ref={fileRef} type="file" accept={kind === "DRAFT" ? "video/mp4,video/webm,video/quicktime" : kind === "PROOF" ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"} className={clipInputClass} /></label>
    {!enabled ? <p className="text-sm text-amber-200">Uploads unavailable until private Clippers storage is configured.</p> : null}
    <p className="text-xs text-neutral-500">Private uploads: images up to 10MB, videos up to 50MB.</p>
    {progress > 0 ? <p role="status" className="text-xs text-neutral-400">Upload {progress}%</p> : null}
  </ClipperForm>;
}

export function ClipReviewVideo({ assetId, code }: { assetId: string; code: string }) {
  return <div className="space-y-2"><div className="relative overflow-hidden rounded-xl bg-black">
    <video controls playsInline preload="none" controlsList="nodownload" className="max-h-96 w-full" src={`/api/clippers/assets/${assetId}`} />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"><span className="-rotate-12 rounded-lg bg-black/35 px-4 py-3 text-center text-sm font-bold text-white/75">SEEDENV PRIVATE REVIEW<br />{code}</span></div>
  </div><p className="text-xs leading-5 text-neutral-500">Review overlay only; not a burned-in watermark or copy protection. Upload a clean final file. Creators retain ownership until and after payment; only the agreed license is granted.</p></div>;
}
