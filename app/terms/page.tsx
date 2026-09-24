export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#090A0F] px-4 py-16 text-white">
      <article className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-6 shadow-2xl shadow-black/80 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">SeedEnv</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <div className="mt-8 space-y-5 text-sm leading-7 text-zinc-400">
          <p>SeedEnv connects developers with testers for structured beta validation tasks. By using SeedEnv, users agree to provide accurate account information and use the platform lawfully.</p>
          <p>Developers are responsible for campaign instructions, funding, and review decisions. Testers are responsible for honest feedback, accurate proof, and compliance with campaign requirements.</p>
          <p>SeedEnv may remove campaigns, submissions, or accounts that violate platform rules, abuse payment flows, or attempt to manipulate rewards.</p>
          <p>These terms are a practical operating summary and should be reviewed by counsel before broad public launch.</p>
        </div>
      </article>
    </main>
  );
}