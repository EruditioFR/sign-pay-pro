/**
 * Server-only observability sink.
 *
 * - Centralise le logging d'erreurs côté serveur.
 * - Best-effort : n'échoue JAMAIS (ne re-throw pas).
 * - Persiste dans `public.error_logs` (via service role).
 * - Émet aussi un `console.error` structuré (visible dans worker logs).
 * - Permet de brancher plus tard Sentry/Datadog via `setExternalErrorSink`.
 *
 * Usage:
 *   await reportServerError(err, {
 *     source: "stripe.webhook",
 *     category: "technical",
 *     organizationId,
 *     context: { paymentId, eventId },
 *   });
 *
 * NE PAS importer depuis le client ni au top-level d'un *.functions.ts
 * (charge `client.server`). Importer dynamiquement dans le handler.
 */

import { AppError, fingerprint, normalizeError } from "./errors";
import type { ErrorCategory, ErrorSeverity } from "./errors";

export interface ReportOptions {
  source: string;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  code?: string;
  organizationId?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
}

type ExternalSink = (payload: {
  source: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code?: string;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  organizationId?: string | null;
  userId?: string | null;
}) => void | Promise<void>;

let externalSink: ExternalSink | undefined;

/** Branche un connecteur externe (Sentry, Datadog…). Optionnel. */
export function setExternalErrorSink(sink: ExternalSink | undefined) {
  externalSink = sink;
}

const SENSITIVE_KEYS = /(authorization|api[_-]?key|secret|token|password|cookie)/i;
function scrub(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 2000) {
      out[k] = v.slice(0, 2000) + "…[truncated]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function reportServerError(err: unknown, opts: ReportOptions): Promise<void> {
  try {
    const norm = normalizeError(err);
    const app = err instanceof AppError ? err : undefined;
    const category: ErrorCategory = opts.category ?? app?.category ?? "technical";
    const severity: ErrorSeverity =
      opts.severity ?? app?.severity ?? (category === "technical" ? "error" : "warning");
    const code = opts.code ?? app?.code;
    const ctx = scrub({ ...(app?.context ?? {}), ...(opts.context ?? {}) });
    const fp = fingerprint(opts.source, code, norm.message);

    // Structured console line (toujours, même si DB down)
    // eslint-disable-next-line no-console
    console.error(
      `[err] src=${opts.source} cat=${category} sev=${severity}${code ? ` code=${code}` : ""} fp=${fp} msg=${norm.message}`,
    );

    // Persist best-effort
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("error_logs").insert({
        organization_id: opts.organizationId ?? null,
        user_id: opts.userId ?? null,
        category,
        severity,
        source: opts.source,
        code: code ?? null,
        message: norm.message.slice(0, 1000),
        fingerprint: fp,
        context: ctx as never,
        stack: norm.stack ? norm.stack.slice(0, 4000) : null,
      });
    } catch (dbErr) {
      // eslint-disable-next-line no-console
      console.error("[err] persistence failed", normalizeError(dbErr).message);
    }

    // External sink (Sentry…)
    if (externalSink) {
      try {
        await externalSink({
          source: opts.source,
          category,
          severity,
          code,
          message: norm.message,
          stack: norm.stack,
          context: ctx,
          organizationId: opts.organizationId,
          userId: opts.userId,
        });
      } catch {
        /* ignore external sink failures */
      }
    }
  } catch {
    // Never throw from the reporter.
  }
}
