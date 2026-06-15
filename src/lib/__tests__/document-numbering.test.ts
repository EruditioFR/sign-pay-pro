import { describe, it, expect } from "vitest";
import { formatLegalNumber, LEGAL_NUMBER_REGEX } from "@/lib/document-numbering";

describe("formatLegalNumber", () => {
  it("formats invoice number FAC-2026-0001 by default pad=4", () => {
    expect(formatLegalNumber({ prefix: "FAC", year: 2026, sequence: 1 })).toBe(
      "FAC-2026-0001",
    );
  });

  it("respects custom pad width", () => {
    expect(
      formatLegalNumber({ prefix: "DEV", year: 2026, sequence: 42, padWidth: 6 }),
    ).toBe("DEV-2026-000042");
  });

  it("supports credit note prefix AVO", () => {
    expect(
      formatLegalNumber({ prefix: "AVO", year: 2025, sequence: 12 }),
    ).toBe("AVO-2025-0012");
  });

  it("does not truncate sequences larger than pad width", () => {
    expect(
      formatLegalNumber({ prefix: "FAC", year: 2026, sequence: 12345, padWidth: 4 }),
    ).toBe("FAC-2026-12345");
  });

  it("produces unique numbers for sequential calls", () => {
    const numbers = new Set(
      Array.from({ length: 100 }, (_, i) =>
        formatLegalNumber({ prefix: "FAC", year: 2026, sequence: i + 1 }),
      ),
    );
    expect(numbers.size).toBe(100);
  });

  it("rejects invalid prefix (no spaces/special chars)", () => {
    expect(() =>
      formatLegalNumber({ prefix: "FA C", year: 2026, sequence: 1 }),
    ).toThrow();
    expect(() =>
      formatLegalNumber({ prefix: "FAC/2026", year: 2026, sequence: 1 }),
    ).toThrow();
  });

  it("rejects invalid year", () => {
    expect(() =>
      formatLegalNumber({ prefix: "FAC", year: 1800, sequence: 1 }),
    ).toThrow();
    expect(() =>
      formatLegalNumber({ prefix: "FAC", year: 12345, sequence: 1 }),
    ).toThrow();
  });

  it("rejects invalid sequence (must be >= 1)", () => {
    expect(() =>
      formatLegalNumber({ prefix: "FAC", year: 2026, sequence: 0 }),
    ).toThrow();
    expect(() =>
      formatLegalNumber({ prefix: "FAC", year: 2026, sequence: -1 }),
    ).toThrow();
  });

  it("output always matches LEGAL_NUMBER_REGEX", () => {
    for (const seq of [1, 7, 99, 1000, 99999]) {
      const n = formatLegalNumber({ prefix: "FAC", year: 2026, sequence: seq });
      expect(n).toMatch(LEGAL_NUMBER_REGEX);
    }
  });
});
