import { describe, it, expect } from "vitest";
import {
  computeExpiresAt,
  isExpired,
  isShareLinkValid,
  shareLinkInvalidReason,
} from "@/lib/sharing-tokens";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("computeExpiresAt", () => {
  it("adds the requested number of days", () => {
    const iso = computeExpiresAt(7, NOW);
    expect(iso).toBe("2026-06-22T12:00:00.000Z");
  });

  it("rejects out-of-range values", () => {
    expect(() => computeExpiresAt(0, NOW)).toThrow();
    expect(() => computeExpiresAt(366, NOW)).toThrow();
    expect(() => computeExpiresAt(Number.NaN, NOW)).toThrow();
  });
});

describe("isExpired", () => {
  it("returns false when no expiry set", () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
  });

  it("returns true when expires_at is in the past", () => {
    expect(isExpired("2026-06-15T11:59:59Z", NOW)).toBe(true);
  });

  it("returns false when expires_at is in the future", () => {
    expect(isExpired("2026-06-15T12:00:01Z", NOW)).toBe(false);
  });

  it("returns false for malformed dates (fail-open, validated upstream)", () => {
    expect(isExpired("not-a-date", NOW)).toBe(false);
  });
});

describe("shareLinkInvalidReason", () => {
  const baseLink = {
    token: "tok_abc",
    expires_at: "2026-12-31T00:00:00Z",
    revoked_at: null,
    views_count: 0,
    max_views: null,
  };

  it("returns null for a valid link", () => {
    expect(shareLinkInvalidReason(baseLink, NOW)).toBeNull();
    expect(isShareLinkValid(baseLink, NOW)).toBe(true);
  });

  it("missing_token when null/empty", () => {
    expect(shareLinkInvalidReason(null, NOW)).toBe("missing_token");
    expect(shareLinkInvalidReason({ ...baseLink, token: "" }, NOW)).toBe(
      "missing_token",
    );
  });

  it("revoked takes precedence over expiry", () => {
    expect(
      shareLinkInvalidReason(
        { ...baseLink, revoked_at: "2026-06-01T00:00:00Z" },
        NOW,
      ),
    ).toBe("revoked");
  });

  it("expired when expires_at < now", () => {
    expect(
      shareLinkInvalidReason(
        { ...baseLink, expires_at: "2026-06-14T00:00:00Z" },
        NOW,
      ),
    ).toBe("expired");
  });

  it("max_views_reached when views_count >= max_views", () => {
    expect(
      shareLinkInvalidReason(
        { ...baseLink, views_count: 5, max_views: 5 },
        NOW,
      ),
    ).toBe("max_views_reached");
    expect(
      shareLinkInvalidReason(
        { ...baseLink, views_count: 6, max_views: 5 },
        NOW,
      ),
    ).toBe("max_views_reached");
  });

  it("ignores view cap when max_views is null", () => {
    expect(
      shareLinkInvalidReason(
        { ...baseLink, views_count: 9999, max_views: null },
        NOW,
      ),
    ).toBeNull();
  });
});
