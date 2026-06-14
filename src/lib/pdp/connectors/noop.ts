/**
 * Connecteur PDP "noop" — implémentation de référence sans appel réseau.
 *
 * Utile pour :
 *   - développer la file d'envoi et l'UI sans contrat PDP
 *   - servir de squelette / template pour un vrai connecteur
 *
 * À remplacer par un connecteur réel (Chorus Pro, iopole, Generix, etc.)
 * en respectant le contrat `PdpConnector`.
 */

import type {
  PdpConnector,
  PdpInvoicePayload,
  PdpStatusResult,
  PdpSubmissionResult,
} from "../types";

export const noopConnector: PdpConnector = {
  id: "noop",
  displayName: "Aucun connecteur (mode simulation)",
  supportedFormats: ["factur_x", "ubl", "cii"],

  async healthCheck() {
    return { ok: true, message: "Mode simulation : aucune PDP connectée." };
  },

  async submit(payload: PdpInvoicePayload): Promise<PdpSubmissionResult> {
    // On simule un dépôt instantané réussi, identifiant déterministe
    // pour rester idempotent.
    return {
      remoteId: `noop-${payload.idempotencyKey}`,
      status: "transmitted",
      message: "Transmission simulée — aucun envoi réseau.",
    };
  },

  async fetchStatus(remoteId: string): Promise<PdpStatusResult> {
    return {
      remoteId,
      status: "transmitted",
      einvoiceStatus: "accepted",
      message: "Statut simulé.",
    };
  },
};
