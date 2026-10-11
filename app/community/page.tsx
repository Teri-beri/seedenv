import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CommunityRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const suffix = query.toString();
  permanentRedirect(suffix ? `/launch-circle?${suffix}` : "/launch-circle");
}
