import { describe, it, expect, beforeEach } from "vitest";
import { MockPDPConnector } from "@/lib/pdp/connectors/mock";
import type { PdpInvoicePayload } from "@/lib/pdp/types";

const payload: PdpInvoicePayload = {
  documentId: "doc-1",
  invoiceNumber: "FAC-2026-0001",
  format: "factur_x",
  buyer: { legalName: "Acme" },
  seller: { legalName: "Vendor" },
  totals: { amountHt: 100, amountTtc: 120, totalVat: 20, currency: "EUR" },
  idempotencyKey: "key-1",
};

describe("MockPDPConnector", () => {
  let c: MockPDPConnector;
  beforeEach(() => { c = new MockPDPConnector(); });

  it("submitInvoice retourne un remoteId déterministe et enregistre la soumission", async () => {
    const r = await c.submitInvoice(payload);
    expect(r.remoteId).toBe("mock-key-1");
    expect(r.status).toBe("transmitted");
    expect(c.submissions.get(r.remoteId)?.payload.invoiceNumber).toBe("FAC-2026-0001");
  });

  it("getStatus renvoie le dernier statut enregistré", async () => {
    const r = await c.submitInvoice(payload);
    const s = await c.getStatus(r.remoteId);
    expect(s.status).toBe("transmitted");
    expect(s.einvoiceStatus).toBe("accepted");
  });

  it("getLifecycleEvents retourne au moins l'évènement de soumission", async () => {
    const r = await c.submitInvoice(payload);
    const events = await c.getLifecycleEvents(r.remoteId);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].code).toBe("submitted");
  });

  it("permet de forcer une erreur sur la prochaine soumission", async () => {
    c.nextSubmitResult = new Error("Timeout PDP");
    await expect(c.submitInvoice(payload)).rejects.toThrow("Timeout PDP");
  });

  it("trace les appels pour assertions de tests", async () => {
    await c.submitInvoice(payload);
    await c.getStatus("mock-key-1");
    expect(c.calls.map((x) => x.method)).toEqual(["submitInvoice", "getStatus"]);
  });
});
