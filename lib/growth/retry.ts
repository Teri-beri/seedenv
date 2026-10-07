import type { GrowthLogger } from "@/lib/growth/log";

export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs?: number) {
    super(message);
    this.name = "HttpError";
  }
}

export function isRetryable(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : undefined;
  if (status !== undefined && !Number.isNaN(status)) return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(error.message));
}

export type RetryOptions = { label: string; shouldRetry?: (error: unknown) => boolean; attempts?: number; baseDelayMs?: number; maxDelayMs?: number; logger?: GrowthLogger; sleep?: (ms: number) => Promise<void> };

// Exponential backoff with full jitter; honours Retry-After on rate limits and gives up immediately on client errors.
export async function withRetry<T>(work: (attempt: number) => Promise<T>, { label, shouldRetry = isRetryable, attempts = 4, baseDelayMs = 1000, maxDelayMs = 30_000, logger, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work(attempt);
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const retryAfter = error instanceof HttpError ? error.retryAfterMs : undefined;
      const delay = Math.min(maxDelayMs, retryAfter ?? Math.random() * baseDelayMs * 2 ** (attempt - 1));
      logger?.warn("retry", { label, attempt, delayMs: Math.round(delay), error: error instanceof Error ? error.message : String(error) });
      await sleep(delay);
    }
  }
}

function retryAfterMs(header: string | null) {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  const response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) throw new HttpError(`${rest.method ?? "GET"} ${new URL(url).host}${new URL(url).pathname} -> ${response.status}: ${text.slice(0, 300)}`, response.status, retryAfterMs(response.headers.get("retry-after")));
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(`Non-JSON response from ${new URL(url).host}`, response.status);
  }
}
