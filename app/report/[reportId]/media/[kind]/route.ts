import { getPublicBugReport } from "@/lib/public-bug-reports";
import { downloadProofObject, getProofImageUrl } from "@/lib/storage";
import { isStoredRecording } from "@/lib/recording";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string; kind: string }> }) {
  const { reportId, kind } = await params;
  const report = await getPublicBugReport(reportId);
  if (!report || !["screenshot", "recording"].includes(kind)) return new Response("Evidence unavailable", { status: 404, headers });
  try {
    if (kind === "screenshot") {
      const file = await downloadProofObject(report.proofImageUrl, 5 * 1024 * 1024);
      if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.mimeType)) return new Response("Screenshot unavailable", { status: 404, headers });
      return new Response(new Uint8Array(file.buffer), { headers: { ...headers, "Content-Type": file.mimeType } });
    }
    if (!isStoredRecording(report.recordingUrl)) return new Response("Recording unavailable", { status: 404, headers });
    const signed = await getProofImageUrl(report.recordingUrl);
    if (!signed) throw new Error("Private recording storage is unavailable.");
    const range = request.headers.get("range");
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return new Response("Unsupported range", { status: 416, headers });
    const source = await fetch(signed, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (source.status === 416) {
      const contentRange = source.headers.get("content-range");
      await source.body?.cancel();
      return new Response("Requested range unavailable", { status: 416, headers: { ...headers, ...(contentRange ? { "Content-Range": contentRange } : {}) } });
    }
    const mime = (source.headers.get("content-type") || "").split(";")[0];
    if (!source.ok || !["video/mp4", "video/webm", "video/quicktime"].includes(mime)) {
      await source.body?.cancel();
      throw new Error(`Recording storage returned ${source.status} (${mime}).`);
    }
    const responseHeaders = new Headers({ ...headers, "Content-Type": mime });
    for (const key of ["content-length", "content-range", "accept-ranges"]) {
      const value = source.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    return new Response(source.body, { status: source.status, headers: responseHeaders });
  } catch (error) {
    console.error("SeedEnv public report evidence failed:", { reportId, kind, error });
    return new Response("Evidence could not be loaded. Try again later.", { status: 503, headers });
  }
}
