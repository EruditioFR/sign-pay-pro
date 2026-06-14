/**
 * Stripe gateway client — routes calls through Lovable's connector gateway.
 * Server-only. Never import from client/route modules at top-level (see
 * tanstack-supabase-integration: load inside handler with await import()).
 */

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/stripe";

function envFor(mode: "sandbox" | "live") {
  const apiKey =
    mode === "live"
      ? process.env.STRIPE_LIVE_API_KEY
      : process.env.STRIPE_SANDBOX_API_KEY;
  const webhookSecret =
    mode === "live"
      ? process.env.PAYMENTS_LIVE_WEBHOOK_SECRET
      : process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error(`[stripe] missing STRIPE_${mode.toUpperCase()}_API_KEY`);
  if (!lovableKey) throw new Error("[stripe] missing LOVABLE_API_KEY");
  return { apiKey, webhookSecret, lovableKey };
}

/** Flatten nested objects into Stripe's form-encoded format (a[b][c]=...) */
function toFormBody(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") {
          out.push(...toFormBody(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof v === "object") {
      out.push(...toFormBody(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export async function stripeRequest<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown>; mode?: "sandbox" | "live" } = {},
): Promise<T> {
  const mode = init.mode ?? "sandbox";
  const { apiKey, lovableKey } = envFor(mode);
  const url = `${GATEWAY_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const method = init.method ?? "POST";
  const body = init.body ? toFormBody(init.body).join("&") : undefined;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const err = (parsed as { error?: { message?: string } })?.error?.message ?? text;
    throw new Error(`[stripe ${path}] ${res.status} ${err}`);
  }
  return parsed as T;
}

/** Stripe webhook signature verification (HMAC-SHA256, Web Crypto). */
export async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  mode: "sandbox" | "live" = "sandbox",
  toleranceSec = 300,
): Promise<{ ok: true; event: Record<string, unknown> } | { ok: false; reason: string }> {
  if (!sigHeader) return { ok: false, reason: "missing_signature" };
  const { webhookSecret } = envFor(mode);
  if (!webhookSecret) return { ok: false, reason: "missing_webhook_secret" };

  // Parse "t=...,v1=...,v1=..."
  const parts = Object.create(null) as Record<string, string[]>;
  for (const seg of sigHeader.split(",")) {
    const [k, v] = seg.split("=");
    if (!k || !v) continue;
    (parts[k] ||= []).push(v);
  }
  const t = parts.t?.[0];
  const sigs = parts.v1 ?? [];
  if (!t || sigs.length === 0) return { ok: false, reason: "malformed_signature" };

  const signedPayload = `${t}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(macBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const match = sigs.some((s) => {
    if (s.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
  if (!match) return { ok: false, reason: "signature_mismatch" };

  const age = Math.floor(Date.now() / 1000) - Number(t);
  if (Number.isFinite(age) && age > toleranceSec) return { ok: false, reason: "timestamp_too_old" };

  try {
    const event = JSON.parse(rawBody) as Record<string, unknown>;
    return { ok: true, event };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

/** Zero-decimal currencies in Stripe. */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

export function toStripeAmount(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  return ZERO_DECIMAL.has(c) ? Math.round(amount) : Math.round(amount * 100);
}

export function fromStripeAmount(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  return ZERO_DECIMAL.has(c) ? amount : amount / 100;
}
