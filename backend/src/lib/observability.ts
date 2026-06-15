/**
 * Error capture (v2 production hardening). Records an exception as a
 * structured error log (secret-scrubbed) and, when ERROR_WEBHOOK_URL is
 * set, posts a compact alert (Slack-compatible `{text}`) — best-effort,
 * never throwing into the caller. Dependency-free so it works anywhere;
 * swap in Sentry later behind the same `captureException` surface.
 */

import { logger } from "./logger";
import { safeErrorMessage } from "./safeError";

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const message = safeErrorMessage(err, "Unhandled error");
  logger.error(message, { ...context, kind: "exception" });

  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!url) return;
  const env = process.env.NODE_ENV ?? "development";
  const where = context?.path ? ` at ${String(context.path)}` : "";
  // Fire-and-forget; failures here must never affect request handling.
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `[lexOS:${env}] ${message}${where}` }),
  }).catch(() => {
    /* swallow */
  });
}
