/**
 * Pure helpers for share-link token validity.
 * No I/O — testable in isolation, reusable client/server.
 */

export interface ShareLinkLike {
  token?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  views_count?: number | null;
  max_views?: number | null;
}

export type ShareLinkInvalidReason =
  | "missing_token"
  | "revoked"
  | "expired"
  | "max_views_reached";

export function computeExpiresAt(days: number, now: Date = new Date()): string {
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    throw new Error(`Invalid expires_in_days: ${days}`);
  }
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t < now.getTime();
}

/**
 * Returns null if the link is valid for use, otherwise a machine-readable
 * reason. Mirrors the checks done in the public route handler.
 */
export function shareLinkInvalidReason(
  link: ShareLinkLike | null | undefined,
  now: Date = new Date(),
): ShareLinkInvalidReason | null {
  if (!link || !link.token) return "missing_token";
  if (link.revoked_at) return "revoked";
  if (isExpired(link.expires_at, now)) return "expired";
  if (
    link.max_views != null &&
    link.views_count != null &&
    link.views_count >= link.max_views
  ) {
    return "max_views_reached";
  }
  return null;
}

export function isShareLinkValid(
  link: ShareLinkLike | null | undefined,
  now: Date = new Date(),
): boolean {
  return shareLinkInvalidReason(link, now) === null;
}
