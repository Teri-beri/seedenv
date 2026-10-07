type Level = "debug" | "info" | "warn" | "error";

export type GrowthLogger = { [K in Level]: (event: string, data?: Record<string, unknown>) => void } & { child: (context: Record<string, unknown>) => GrowthLogger };

const SECRET_KEYS = /token|secret|password|api_?key|private_?key|^key$|authorization|cookie/i;

function redact(data: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, SECRET_KEYS.test(key) ? "[redacted]" : value instanceof Error ? value.message : value]));
}

// One JSON line per event so Render/GitHub logs stay searchable even when notification channels are down.
export function createLogger(context: Record<string, unknown> = {}, sink: (line: string, level: Level) => void = (line, level) => (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line)): GrowthLogger {
  const emit = (level: Level) => (event: string, data?: Record<string, unknown>) => sink(JSON.stringify({ ts: new Date().toISOString(), level, scope: "growth", event, ...context, ...redact(data) }), level);
  return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error"), child: (extra) => createLogger({ ...context, ...extra }, sink) };
}
