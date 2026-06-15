import { describe, it, expect } from "vitest";
import {
  canTransition,
  isInvoiceStatus,
  manualNextStatuses,
  INVOICE_STATUSES,
} from "@/lib/invoice-lifecycle";

describe("invoice-lifecycle state machine", () => {
  it("recognizes all canonical statuses", () => {
    for (const s of INVOICE_STATUSES) {
      expect(isInvoiceStatus(s)).toBe(true);
    }
    expect(isInvoiceStatus("unknown")).toBe(false);
    expect(isInvoiceStatus(null)).toBe(false);
    expect(isInvoiceStatus(undefined)).toBe(false);
  });

  it("allows forward transitions on the happy path", () => {
    expect(canTransition("draft", "issued")).toBe(true);
    expect(canTransition("issued", "sent")).toBe(true);
    expect(canTransition("sent", "viewed")).toBe(true);
    expect(canTransition("viewed", "partially_paid")).toBe(true);
    expect(canTransition("partially_paid", "paid")).toBe(true);
    expect(canTransition("paid", "archived")).toBe(true);
  });

  it("rejects backward transitions on locked states", () => {
    expect(canTransition("paid", "draft")).toBe(false);
    expect(canTransition("paid", "sent")).toBe(false);
    expect(canTransition("archived", "draft")).toBe(false);
    expect(canTransition("cancelled", "issued")).toBe(false);
  });

  it("allows same-state transition (idempotent)", () => {
    expect(canTransition("draft", "draft")).toBe(true);
    expect(canTransition("paid", "paid")).toBe(true);
  });

  it("rejects transitions involving non-invoice statuses", () => {
    expect(canTransition("draft", "signed")).toBe(false);
    expect(canTransition("pending_validation", "issued")).toBe(false);
  });

  it("rejected can be re-issued (correction loop)", () => {
    expect(canTransition("rejected", "issued")).toBe(true);
  });

  it("manualNextStatuses excludes payment & view-tracking driven transitions", () => {
    const nexts = manualNextStatuses("issued");
    expect(nexts).not.toContain("partially_paid");
    expect(nexts).not.toContain("paid");
    expect(nexts).not.toContain("viewed");
    expect(nexts).toContain("sent");
  });

  it("manualNextStatuses returns [] for unknown status", () => {
    expect(manualNextStatuses("nope")).toEqual([]);
  });
});
