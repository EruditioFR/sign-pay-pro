import { describe, it, expect } from "vitest";
import {
  SIGNATURE_LEVELS,
  CURRENT_SUPPORTED_LEVEL,
  CONSENT_TEXT_VERSION,
  DEFAULT_CONSENT_TEXT_FR,
  buildConsentRecord,
  assertAuthMethodAllowed,
  tokenHint,
} from "@/lib/signature-conformity";

describe("SIGNATURE_LEVELS catalogue", () => {
  it("exposes SES, AES, QES with distinct allowed auth methods", () => {
    expect(SIGNATURE_LEVELS.ses.allowedAuthMethods).toEqual(["email_link"]);
    expect(SIGNATURE_LEVELS.aes.allowedAuthMethods).toEqual(
      expect.arrayContaining(["email_otp", "sms_otp"]),
    );
    expect(SIGNATURE_LEVELS.qes.allowedAuthMethods).toEqual(["id_verification"]);
  });

  it("current supported level is SES", () => {
    expect(CURRENT_SUPPORTED_LEVEL).toBe("ses");
  });

  it("each level has a legal reference and label", () => {
    for (const level of ["ses", "aes", "qes"] as const) {
      expect(SIGNATURE_LEVELS[level].legalRef.length).toBeGreaterThan(0);
      expect(SIGNATURE_LEVELS[level].label.length).toBeGreaterThan(0);
    }
  });
});

describe("assertAuthMethodAllowed — SES vs AES detection", () => {
  it("accepts email_link for SES", () => {
    expect(() => assertAuthMethodAllowed("ses", "email_link")).not.toThrow();
  });

  it("rejects email_link for AES (requires 2FA)", () => {
    expect(() => assertAuthMethodAllowed("aes", "email_link")).toThrow(
      /not allowed/i,
    );
  });

  it("rejects email_otp for SES (would be over-spec)", () => {
    expect(() => assertAuthMethodAllowed("ses", "email_otp")).toThrow();
  });

  it("accepts email_otp / sms_otp for AES", () => {
    expect(() => assertAuthMethodAllowed("aes", "email_otp")).not.toThrow();
    expect(() => assertAuthMethodAllowed("aes", "sms_otp")).not.toThrow();
  });

  it("only id_verification qualifies for QES", () => {
    expect(() => assertAuthMethodAllowed("qes", "id_verification")).not.toThrow();
    expect(() => assertAuthMethodAllowed("qes", "email_otp")).toThrow();
    expect(() => assertAuthMethodAllowed("qes", "email_link")).toThrow();
  });
});

describe("buildConsentRecord", () => {
  it("stamps the current version + ISO timestamp + default FR text", () => {
    const rec = buildConsentRecord();
    expect(rec.text).toBe(DEFAULT_CONSENT_TEXT_FR);
    expect(rec.version).toBe(CONSENT_TEXT_VERSION);
    expect(() => new Date(rec.accepted_at).toISOString()).not.toThrow();
    expect(rec.accepted_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("accepts a custom consent text", () => {
    const rec = buildConsentRecord("custom");
    expect(rec.text).toBe("custom");
    expect(rec.version).toBe(CONSENT_TEXT_VERSION);
  });
});

describe("tokenHint", () => {
  it("returns the token as-is when short", () => {
    expect(tokenHint("abc")).toBe("abc");
  });

  it("masks long tokens but keeps a recognisable hint", () => {
    const t = "0123456789abcdef0123456789abcdef";
    const hint = tokenHint(t);
    expect(hint.startsWith("01234567")).toBe(true);
    expect(hint.endsWith("cdef")).toBe(true);
    expect(hint).toContain("…");
    expect(hint.length).toBeLessThan(t.length);
  });
});
