"use client";

import { GitBranch, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { removeGitHubToken, saveGitHubToken } from "@/app/actions/githubActions";
import { Button } from "@/components/ui/button";

export function GitHubTokenForm({ connected }: { connected: boolean }) {
  const [isConnected, setIsConnected] = useState(connected);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveGitHubToken(token);
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setToken("");
      setIsConnected(true);
      setMessage({ ok: true, text: `Token saved${result.login ? ` for @${result.login}` : ""}. It is stored encrypted and never shown again.` });
    });
  }

  function remove() {
    setMessage(null);
    startTransition(async () => {
      await removeGitHubToken();
      setIsConnected(false);
      setMessage({ ok: true, text: "GitHub token removed." });
    });
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><GitBranch className="size-4" /> GitHub issue export</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-400">Export tester submissions as issues in the repo set on each cohort. Use a fine-grained token limited to those repositories with <span className="font-mono text-neutral-300">Issues: Read and write</span>.</p>
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${isConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}>{isConnected ? "CONNECTED" : "NOT SET"}</span>
      </div>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={save}>
        <label className="sr-only" htmlFor="github-token">GitHub personal access token</label>
        <input autoComplete="off" className="min-h-11 flex-1 rounded-lg border border-zinc-800 bg-[#090A0F] px-4 font-mono text-sm text-white outline-none placeholder:text-neutral-600 focus:border-zinc-600" id="github-token" onChange={(event) => setToken(event.target.value)} placeholder={isConnected ? "Paste a new token to replace" : "github_pat_…"} spellCheck={false} type="password" value={token} />
        <Button disabled={isPending || token.trim().length < 20} type="submit" variant="light">{isPending ? <LoaderCircle className="size-4 animate-spin" /> : null} Save token</Button>
        {isConnected ? <Button disabled={isPending} onClick={remove} type="button" variant="outline">Remove</Button> : null}
      </form>
      <p className="mt-3 text-xs text-neutral-500"><a className="underline underline-offset-2 hover:text-neutral-300" href="https://github.com/settings/personal-access-tokens/new" rel="noreferrer" target="_blank">Create a fine-grained token on GitHub ↗</a></p>
      {message ? <p className={`mt-3 text-sm ${message.ok ? "text-emerald-300" : "text-rose-300"}`} role="status">{message.text}</p> : null}
    </section>
  );
}
