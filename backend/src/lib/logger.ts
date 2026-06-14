/**
 * Structured logging (v2 production hardening). Dependency-free JSON lines
 * to stdout/stderr so a log shipper (Datadog, Loki, CloudWatch, …) can
 * parse them. Level-filtered via LOG_LEVEL (debug|info|warn|error).
 * Formatting is pure and unit-tested.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error"
    ? raw
    : "info";
}

export function shouldLog(level: LogLevel, min: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[min];
}

/** Build a single JSON log line. Pure. */
export function formatLog(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>,
): string {
  const record: Record<string, unknown> = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  try {
    return JSON.stringify(record);
  } catch {
    // Circular/unserializable meta — fall back to the message only.
    return JSON.stringify({ t: record.t, level, msg });
  }
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level, configuredLevel())) return;
  const line = formatLog(level, msg, meta);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    emit("error", msg, meta),
};
