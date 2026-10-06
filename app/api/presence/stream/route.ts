import { subscribeToVisitorPulses } from "@/lib/visitor-pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 25_000;

export function GET(request: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const unsubscribe = subscribeToVisitorPulses((pulse) => {
        send(`event: arrival\ndata: ${JSON.stringify(pulse)}\n\n`);
      });
      // Comment frames keep proxies (Render) from closing an idle connection.
      const keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);

      cleanup = () => {
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener("abort", () => cleanup(), { once: true });
      send("retry: 5000\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
