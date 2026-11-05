import { freeToolsGuide } from "@/lib/free-tool-discovery";

export const dynamic = "force-static";

export function GET() {
  return new Response(freeToolsGuide(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
