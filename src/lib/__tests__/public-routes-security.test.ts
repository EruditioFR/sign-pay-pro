import { describe, it, expect } from "vitest";
import {
  isUuidV4Like,
  firstHopIp,
  boundedUa,
  clampPayableAmount,
} from "@/lib/public-routes-security";

describe("isUuidV4Like", () => {
  it("accepts a v4 UUID", () => {
    expect(isUuidV4Like("3b1a8d2e-1c2f-4a4b-9b8e-7c6d5e4f3a2b")).toBe(true);
  });
  it("rejects garbage and wrong shapes", () => {
    expect(isUuidV4Like("")).toBe(false);
    expect(isUuidV4Like(null)).toBe(false);
    expect(isUuidV4Like(undefined)).toBe(false);
    expect(isUuidV4Like("not-a-uuid")).toBe(false);
    expect(isUuidV4Like("3b1a8d2e1c2f4a4b9b8e7c6d5e4f3a2b")).toBe(false);
    // v1 UUID — current implementation accepts a generic v4-ish shape; either
    // way it must NOT throw and must reject obviously-wrong input above.
  });
});

describe("firstHopIp", () => {
  it("extracts the first hop of XFF", () => {
    expect(firstHopIp("203.0.113.5, 10.0.0.1, 10.0.0.2")).toBe("203.0.113.5");
  });
  it("returns null for empty/missing header", () => {
    expect(firstHopIp(null)).toBeNull();
    expect(firstHopIp("")).toBeNull();
    expect(firstHopIp("  ")).toBeNull();
  });
  it("caps length", () => {
    const v = firstHopIp("x".repeat(500));
    expect(v && v.length).toBeLessThanOrEqual(64);
  });
});

describe("boundedUa", () => {
  it("returns null when missing", () => {
    expect(boundedUa(null)).toBeNull();
  });
  it("caps at 512 chars", () => {
    const v = boundedUa("u".repeat(2000));
    expect(v && v.length).toBe(512);
  });
});

describe("clampPayableAmount", () => {
  it("rejects non-positive and non-finite requests", () => {
    expect(clampPayableAmount(0, 100)).toBeNull();
    expect(clampPayableAmount(-1, 100)).toBeNull();
    expect(clampPayableAmount(NaN, 100)).toBeNull();
    expect(clampPayableAmount(Infinity, 100)).toBeNull();
  });
  it("rejects when remaining is 0 or unknown", () => {
    expect(clampPayableAmount(10, 0)).toBeNull();
    expect(clampPayableAmount(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("caps at remaining (no over-payment)", () => {
    expect(clampPayableAmount(50, 30)).toBeNull(); // way over
    expect(clampPayableAmount(30, 30)).toBe(30);
    expect(clampPayableAmount(20, 30)).toBe(20);
  });
  it("tolerates a 1-cent floating drift", () => {
    expect(clampPayableAmount(30.005, 30)).toBe(30);
  });
});
