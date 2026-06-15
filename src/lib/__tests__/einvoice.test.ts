import { describe, it, expect } from "vitest";
import { canTransition } from "@/lib/einvoice";

describe("einvoice state machine", () => {
  it("happy path draft → submitted → received → accepted → paid → archived", () => {
    expect(canTransition("not_applicable", "draft")).toBe(true);
    expect(canTransition("draft", "ready")).toBe(true);
    expect(canTransition("ready", "submitted")).toBe(true);
    expect(canTransition("submitted", "received")).toBe(true);
    expect(canTransition("received", "accepted")).toBe(true);
    expect(canTransition("accepted", "paid")).toBe(true);
    expect(canTransition("paid", "archived")).toBe(true);
  });

  it("PDP rejection can loop back to draft", () => {
    expect(canTransition("rejected", "draft")).toBe(true);
  });

  it("archived is terminal", () => {
    expect(canTransition("archived", "draft")).toBe(false);
    expect(canTransition("archived", "paid")).toBe(false);
  });

  it("cannot skip submission steps", () => {
    expect(canTransition("draft", "accepted")).toBe(false);
    expect(canTransition("ready", "paid")).toBe(false);
  });
});
