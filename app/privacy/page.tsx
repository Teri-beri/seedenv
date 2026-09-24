export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#090A0F] px-4 py-16 text-white">
      <article className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-6 shadow-2xl shadow-black/80 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">SeedEnv</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <div className="mt-8 space-y-5 text-sm leading-7 text-zinc-400">
          <p>SeedEnv collects the account, authentication, campaign, submission, payment, and analytics information needed to operate the platform.</p>
          <p>Tester proof files may be stored with our storage provider so developers can review submitted work. Payment and escrow activity may be processed through Stripe.</p>
          <p>We use service providers for authentication email, storage, analytics, hosting, and payments. We do not sell personal information.</p>
          <p>For privacy requests, contact the SeedEnv operator using the support channel published on the main site.</p>
        </div>
      </article>
    </main>
  );
}