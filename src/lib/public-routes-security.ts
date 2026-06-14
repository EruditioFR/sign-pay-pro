/**
 * Security helpers shared by the unauthenticated `/api/public/share` and
 * `/api/public/sign-request` routes.
 *
 * These routes are exposed without an authenticated session and accept
 * JSON bodies submitted by anyone who has a valid token. Helpers here
 * harden inputs that are otherwise easy to spoof or misuse :
 *
 *   - `isUuidV4Like()` : early format check on `:token` params to reject
 *     malformed input before any DB lookup (cuts down enumeration noise).
 *   - `firstHopIp()` : strips the multi-hop `X-Forwarded-For` header to the
 *     first (client-facing) value and bounds its length.
 *   - `boundedUa()` : caps user-agent strings written to audit metadata.
 *   - `computeRemainingDue()` : returns the remaining amount that may still
 *     be paid against a document, accounting for previously succeeded
 *     payments. Used to clamp amounts submitted from public payment forms.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computePaidAmount } from "@/lib/payment-status";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidV4Like(token: string | undefined | null): boolean {
  return typeof token === "string" && UUID_RE.test(token);
}

const IP_MAX = 64;
const UA_MAX = 512;

export function firstHopIp(header: string | null | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  return first.slice(0, IP_MAX);
}

export function boundedUa(header: string | null | undefined): string | null {
  if (!header) return null;
  return header.slice(0, UA_MAX);
}

/**
 * Maximum amount still owed on a document, in the document's currency.
 * Returns 0 when the document is already fully paid, archived or
 * cancelled. Returns `Infinity` when the document has no recorded amount
 * (defensive : callers should treat that as "unknown" and reject).
 */
export async function computeRemainingDue(
  supabase: SupabaseClient,
  doc: { id: string; status: string | null; amount_ttc: number | string | null; amount_ht: number | string | null },
): Promise<number> {
  if (doc.status && ["archived", "cancelled", "paid"].includes(doc.status)) return 0;
  const due = Number(doc.amount_ttc ?? doc.amount_ht ?? 0);
  if (!Number.isFinite(due) || due <= 0) return Number.POSITIVE_INFINITY;

  const { data } = await supabase
    .from("document_payments")
    .select("amount, status, metadata")
    .eq("document_id", doc.id);
  const paid = computePaidAmount(data ?? []);
  return Math.max(0, +(due - paid).toFixed(2));
}

/** Cap amount to remaining due; returns null when the amount is not payable. */
export function clampPayableAmount(
  requested: number,
  remaining: number,
): number | null {
  if (!Number.isFinite(requested) || requested <= 0) return null;
  if (remaining <= 0) return null;
  if (remaining === Number.POSITIVE_INFINITY) return null; // unknown total
  // Allow a 1-cent tolerance for floating-point rounding.
  if (requested > remaining + 0.01) return null;
  return Math.min(requested, remaining);
}
