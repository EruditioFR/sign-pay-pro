import { describe, it, expect } from "vitest";
import {
  AppError,
  toUserMessage,
  normalizeError,
  fingerprint,
} from "@/lib/errors";

describe("AppError", () => {
  it("defaults severity from category", () => {
    const tech = new AppError({ category: "technical", code: "X", message: "boom" });
    expect(tech.severity).toBe("error");
    const biz = new AppError({ category: "business", code: "X", message: "boom" });
    expect(biz.severity).toBe("warning");
  });

  it("provides a safe default userMessage per category", () => {
    expect(new AppError({ category: "user", code: "X", message: "raw" }).userMessage)
      .toMatch(/invalide/i);
    expect(new AppError({ category: "technical", code: "X", message: "raw" }).userMessage)
      .toMatch(/technique/i);
  });

  it("keeps explicit userMessage when provided", () => {
    const e = new AppError({
      category: "business",
      code: "PAYMENT_EXCEEDS_DUE",
      message: "internal",
      userMessage: "Le montant dépasse le solde dû.",
    });
    expect(e.userMessage).toBe("Le montant dépasse le solde dû.");
  });
});

describe("toUserMessage", () => {
  it("returns AppError.userMessage as-is", () => {
    const e = new AppError({
      category: "user",
      code: "BAD_INPUT",
      message: "raw",
      userMessage: "Champ requis.",
    });
    expect(toUserMessage(e)).toBe("Champ requis.");
  });

  it("never leaks raw Error.message — returns fallback", () => {
    const raw = new Error("Database connection refused at 10.0.0.5:5432");
    const msg = toUserMessage(raw);
    expect(msg).not.toContain("10.0.0.5");
    expect(msg).not.toContain("Database");
  });

  it("uses caller fallback for non-AppError", () => {
    expect(toUserMessage(new Error("x"), "Réessayez plus tard.")).toBe(
      "Réessayez plus tard.",
    );
  });
});

describe("normalizeError", () => {
  it("handles strings and unknowns without throwing", () => {
    expect(normalizeError("oops").message).toBe("oops");
    expect(normalizeError({ foo: 1 }).message).toContain("foo");
    expect(normalizeError(undefined).name).toBe("UnknownError");
  });
});

describe("fingerprint", () => {
  it("is stable for identical inputs", () => {
    expect(fingerprint("src.a", "CODE", "msg")).toBe(
      fingerprint("src.a", "CODE", "msg"),
    );
  });
  it("differs across sources", () => {
    expect(fingerprint("src.a", "CODE", "msg")).not.toBe(
      fingerprint("src.b", "CODE", "msg"),
    );
  });
});
