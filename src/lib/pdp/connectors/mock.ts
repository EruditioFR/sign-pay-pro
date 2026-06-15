/**
 * MockPDPConnector — implémentation en mémoire pour les tests unitaires.
 *
 * Contrairement au `noopConnector` (qui répond toujours "transmis"), ce
 * mock conserve un journal des appels et permet de scripter les réponses
 * (succès, erreur, transitions de statut, évènements cycle de vie).
 *
 * À utiliser uniquement dans les tests — ne pas l'enregistrer dans le
 * registre de production.
 */

import type { IPDPConnector, PdpLifecycleEvent } from "../IPDPConnector";
import type {
  PdpInvoicePayload,
  PdpStatusResult,
  PdpSubmissionResult,
  TransmissionStatus,
} from "../types";

export interface MockSubmission {
  remoteId: string;
  payload: PdpInvoicePayload;
  status: TransmissionStatus;
  einvoiceStatus?: PdpStatusResult["einvoiceStatus"];
  events: PdpLifecycleEvent[];
}

export class MockPDPConnector implements IPDPConnector {
  readonly id = "mock";
  readonly displayName = "Mock PDP (tests)";

  readonly submissions = new Map<string, MockSubmission>();
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  /** Permet de forcer la prochaine réponse `submitInvoice`. */
  nextSubmitResult: Partial<PdpSubmissionResult> | Error | null = null;
  /** Permet de forcer la prochaine réponse `getStatus`. */
  nextStatusResult: Partial<PdpStatusResult> | Error | null = null;

  async submitInvoice(payload: PdpInvoicePayload): Promise<PdpSubmissionResult> {
    this.calls.push({ method: "submitInvoice", args: [payload] });
    if (this.nextSubmitResult instanceof Error) {
      const err = this.nextSubmitResult;
      this.nextSubmitResult = null;
      throw err;
    }
    const forced = this.nextSubmitResult ?? {};
    this.nextSubmitResult = null;

    const remoteId = forced.remoteId ?? `mock-${payload.idempotencyKey}`;
    const status: TransmissionStatus = forced.status ?? "transmitted";
    const submission: MockSubmission = {
      remoteId,
      payload,
      status,
      einvoiceStatus: "submitted",
      events: [
        {
          id: `${remoteId}-evt-1`,
          code: "submitted",
          occurredAt: new Date().toISOString(),
          message: "Submitted (mock).",
        },
      ],
    };
    this.submissions.set(remoteId, submission);
    return { remoteId, status, message: forced.message ?? "Mock submission." };
  }

  async getStatus(remoteId: string): Promise<PdpStatusResult> {
    this.calls.push({ method: "getStatus", args: [remoteId] });
    if (this.nextStatusResult instanceof Error) {
      const err = this.nextStatusResult;
      this.nextStatusResult = null;
      throw err;
    }
    const forced = this.nextStatusResult ?? {};
    this.nextStatusResult = null;
    const sub = this.submissions.get(remoteId);
    return {
      remoteId,
      status: forced.status ?? sub?.status ?? "transmitted",
      einvoiceStatus: forced.einvoiceStatus ?? sub?.einvoiceStatus ?? "accepted",
      message: forced.message ?? "Mock status.",
    };
  }

  async getLifecycleEvents(remoteId: string): Promise<PdpLifecycleEvent[]> {
    this.calls.push({ method: "getLifecycleEvents", args: [remoteId] });
    return this.submissions.get(remoteId)?.events ?? [];
  }

  /** Helpers pour les tests. */
  reset(): void {
    this.submissions.clear();
    this.calls.length = 0;
    this.nextSubmitResult = null;
    this.nextStatusResult = null;
  }

  pushLifecycleEvent(remoteId: string, event: PdpLifecycleEvent): void {
    const sub = this.submissions.get(remoteId);
    if (sub) sub.events.push(event);
  }
}
