import { redirect } from "next/navigation";
import { toolUrlSchema } from "@/lib/organic-growth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export const metadata = { title: "Launch a test sprint", robots: { index: false, follow: false } };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  const parsed = toolUrlSchema.safeParse(url);
  if (url && !parsed.success) return <main className="min-h-screen bg-zinc-950 p-6 text-zinc-200"><p role="alert">{parsed.error.issues[0].message}</p><a href="/tools" className="mt-4 inline-flex min-h-11 items-center text-emerald-300">Return to developer tools</a></main>;
  const query = new URLSearchParams({ view: "new-drop", sprint: "1" });
  if (parsed.success) query.set("url", parsed.data);
  const destination = `/console?${query}`;
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "TESTER") redirect(`/onboarding?${new URLSearchParams({ role: "DEVELOPER", next: destination })}`);
  redirect(destination);
}
