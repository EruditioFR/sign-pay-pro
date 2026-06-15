import { describe, it, expect } from "vitest";
import {
  computePaidAmount,
  computePaymentSummary,
  hasRefundActivity,
} from "@/lib/payment-status";

describe("computePaidAmount", () => {
  it("returns 0 for empty/nullish inputs", () => {
    expect(computePaidAmount(null)).toBe(0);
    expect(computePaidAmount([])).toBe(0);
  });

  it("sums only succeeded payments", () => {
    const total = computePaidAmount([
      { amount: 100, status: "succeeded" },
      { amount: 50, status: "pending" },
      { amount: 25, status: "failed" },
      { amount: 30, status: "succeeded" },
    ]);
    expect(total).toBe(130);
  });

  it("treats refunded as 0 and partially_refunded as net", () => {
    const total = computePaidAmount([
      { amount: 200, status: "refunded" },
      { amount: 100, status: "partially_refunded", metadata: { refunded_amount: 40 } },
      { amount: 50, status: "succeeded" },
    ]);
    expect(total).toBe(110);
  });

  it("coerces string amounts", () => {
    expect(computePaidAmount([{ amount: "12.50", status: "succeeded" }])).toBe(12.5);
  });
});

describe("hasRefundActivity", () => {
  it("detects refunded/partially_refunded rows", () => {
    expect(hasRefundActivity([{ amount: 10, status: "succeeded" }])).toBe(false);
    expect(hasRefundActivity([{ amount: 10, status: "refunded" }])).toBe(true);
    expect(
      hasRefundActivity([{ amount: 10, status: "partially_refunded" }]),
    ).toBe(true);
  });
});

describe("computePaymentSummary", () => {
  const today = new Date("2026-06-15T12:00:00Z");

  it("→ unpaid when nothing paid and no due date", () => {
    const r = computePaymentSummary({ amountTtc: 100, now: today });
    expect(r.status).toBe("unpaid");
    expect(r.remaining).toBe(100);
  });

  it("→ paid when paidAmount ≥ dueAmount", () => {
    const r = computePaymentSummary({ amountTtc: 100, paidAmount: 100, now: today });
    expect(r.status).toBe("paid");
    expect(r.remaining).toBe(0);
  });

  it("→ partially_paid when 0 < paid < due and not overdue", () => {
    const r = computePaymentSummary({
      amountTtc: 100,
      paidAmount: 40,
      dueDate: "2026-12-31",
      now: today,
    });
    expect(r.status).toBe("partially_paid");
    expect(r.remaining).toBe(60);
    expect(r.isOverdue).toBe(false);
  });

  it("→ overdue when nothing paid and due_date passed", () => {
    const r = computePaymentSummary({
      amountTtc: 100,
      dueDate: "2026-01-01",
      now: today,
    });
    expect(r.status).toBe("overdue");
    expect(r.isOverdue).toBe(true);
  });

  it("partial payment + overdue → overdue (not partially_paid)", () => {
    const r = computePaymentSummary({
      amountTtc: 100,
      paidAmount: 40,
      dueDate: "2026-01-01",
      now: today,
    });
    expect(r.status).toBe("overdue");
    expect(r.isOverdue).toBe(true);
  });

  it("archived → not_applicable (never overdue)", () => {
    const r = computePaymentSummary({
      documentStatus: "archived",
      amountTtc: 100,
      dueDate: "2020-01-01",
      now: today,
    });
    expect(r.status).toBe("not_applicable");
    expect(r.isOverdue).toBe(false);
  });

  it("fully refunded with no remaining paid → refunded", () => {
    const r = computePaymentSummary({
      amountTtc: 100,
      payments: [{ amount: 100, status: "refunded" }],
      now: today,
    });
    expect(r.status).toBe("refunded");
    expect(r.paidAmount).toBe(0);
  });

  it("uses payments rows when provided (overrides paidAmount)", () => {
    const r = computePaymentSummary({
      amountTtc: 100,
      paidAmount: 999, // should be ignored
      payments: [{ amount: 30, status: "succeeded" }],
      now: today,
    });
    expect(r.paidAmount).toBe(30);
    expect(r.status).toBe("partially_paid");
  });

  it("dueAmount = 0 never overdue", () => {
    const r = computePaymentSummary({
      amountTtc: 0,
      dueDate: "2000-01-01",
      now: today,
    });
    expect(r.status).toBe("unpaid");
    expect(r.isOverdue).toBe(false);
  });
});
