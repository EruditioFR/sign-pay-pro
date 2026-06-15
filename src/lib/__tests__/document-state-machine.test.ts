import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertCanTransition,
  canArchive,
  canCancel,
  canRequestSignature,
  canRecordPayment,
  canModify,
  isReadOnlyStatus,
  isTerminalStatus,
  buildTransitionAuditEntry,
} from "@/lib/document-state-machine";

describe("document-state-machine", () => {
  it("allows the happy path draft → sent → signed → paid → archived", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    expect(canTransition("sent", "signed")).toBe(true);
    expect(canTransition("signed", "paid")).toBe(true);
    expect(canTransition("paid", "archived")).toBe(true);
  });

  it("forbids invalid transitions", () => {
    expect(canTransition("paid", "draft")).toBe(false);
    expect(canTransition("archived", "sent")).toBe(false);
    expect(canTransition("cancelled", "signed")).toBe(false);
    expect(canTransition("signed", "draft")).toBe(false);
  });

  it("assertCanTransition throws on invalid transitions", () => {
    expect(() => assertCanTransition("archived", "signed")).toThrow();
    expect(() => assertCanTransition("draft", "sent")).not.toThrow();
    // identity is a no-op
    expect(() => assertCanTransition("draft", "draft")).not.toThrow();
  });

  it("treats archived and cancelled as terminal / read-only", () => {
    expect(isTerminalStatus("archived")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isReadOnlyStatus("archived")).toBe(true);
    expect(isReadOnlyStatus("draft")).toBe(false);
    expect(canModify("archived")).toBe(false);
    expect(canModify("sent")).toBe(true);
  });

  it("blocks re-signature on archived / cancelled / paid", () => {
    expect(canRequestSignature("archived")).toBe(false);
    expect(canRequestSignature("cancelled")).toBe(false);
    expect(canRequestSignature("paid")).toBe(false);
    expect(canRequestSignature("sent")).toBe(true);
  });

  it("blocks payment recording on archived / cancelled / paid", () => {
    expect(canRecordPayment("archived")).toBe(false);
    expect(canRecordPayment("cancelled")).toBe(false);
    expect(canRecordPayment("paid")).toBe(false);
    expect(canRecordPayment("partially_paid")).toBe(true);
  });

  it("archive allowed from active states, blocked from terminal", () => {
    expect(canArchive("draft")).toBe(true);
    expect(canArchive("paid")).toBe(true);
    expect(canArchive("archived")).toBe(false);
    expect(canArchive("cancelled")).toBe(false);
  });

  it("cancel blocked once signed or paid", () => {
    expect(canCancel("draft")).toBe(true);
    expect(canCancel("sent")).toBe(true);
    expect(canCancel("signed")).toBe(false);
    expect(canCancel("paid")).toBe(false);
    expect(canCancel("archived")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });

  it("buildTransitionAuditEntry shapes audit metadata", () => {
    const entry = buildTransitionAuditEntry({
      organization_id: "org-1",
      user_id: "user-1",
      document_id: "doc-1",
      from: "sent",
      to: "archived",
      reason: "fin de cycle",
    });
    expect(entry.action).toBe("document.transition.archived");
    expect(entry.resource).toBe("document:doc-1");
    expect(entry.metadata).toMatchObject({ from: "sent", to: "archived", reason: "fin de cycle" });
  });
});
