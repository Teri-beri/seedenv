import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CommunityDiscussionRedirectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const { page } = await searchParams;
  const target = `/launch-circle/${encodeURIComponent(id)}`;
  permanentRedirect(page ? `${target}?page=${encodeURIComponent(page)}` : target);
}
