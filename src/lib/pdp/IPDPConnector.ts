/**
 * IPDPConnector — interface abstraite "haut niveau" pour un futur
 * connecteur PDP (Plateforme de Dématérialisation Partenaire).
 *
 * Cette interface est volontairement orientée "métier facture" et expose
 * uniquement les 3 méthodes contractuelles attendues par le reste de
 * l'application :
 *
 *   - `submitInvoice(payload)` : dépose une facture à la PDP
 *   - `getStatus(remoteId)`    : récupère l'état d'une transmission
 *   - `getLifecycleEvents(id)` : récupère l'historique cycle de vie
 *
 * Le connecteur bas-niveau historique (`PdpConnector` dans `./types.ts`)
 * reste utilisé par le service de file. `IPDPConnector` peut être branché
 * par-dessus n'importe quelle implémentation réelle (Chorus Pro, iopole,
 * Generix, etc.) sans avoir à modifier la file d'envoi, l'audit ou l'UI.
 */

import type {
  PdpConnector,
  PdpInvoicePayload,
  PdpStatusResult,
  PdpSubmissionResult,
} from "./types";

/** Évènement de cycle de vie e-invoicing (proche du référentiel Chorus Pro). */
export interface PdpLifecycleEvent {
  /** Identifiant logique de l'évènement (PDP-specific ou interne). */
  id: string;
  /** Code normalisé (ex: "submitted", "received", "accepted", "rejected"). */
  code: string;
  /** Horodatage ISO de l'évènement côté PDP. */
  occurredAt: string;
  /** Message libre. */
  message?: string;
  /** Charge utile brute renvoyée par la PDP (pour audit). */
  raw?: unknown;
}

/** Contrat principal qu'un connecteur PDP doit implémenter. */
export interface IPDPConnector {
  readonly id: string;
  readonly displayName: string;

  submitInvoice(payload: PdpInvoicePayload): Promise<PdpSubmissionResult>;
  getStatus(remoteId: string): Promise<PdpStatusResult>;
  getLifecycleEvents(remoteId: string): Promise<PdpLifecycleEvent[]>;
}

/**
 * Adapte un `PdpConnector` (bas niveau) vers `IPDPConnector` (haut niveau).
 * Utilisé pour exposer le registre existant sans casser la compatibilité.
 */
export function asIPDPConnector(connector: PdpConnector): IPDPConnector {
  return {
    id: connector.id,
    displayName: connector.displayName,
    submitInvoice: (payload) => connector.submit(payload),
    getStatus: (remoteId) => connector.fetchStatus(remoteId),
    async getLifecycleEvents(remoteId) {
      // Fallback générique : un connecteur peut implémenter
      // `getLifecycleEvents` en surchargeant directement IPDPConnector.
      const status = await connector.fetchStatus(remoteId);
      return [
        {
          id: `${remoteId}-current`,
          code: status.einvoiceStatus ?? status.status,
          occurredAt: new Date().toISOString(),
          message: status.message,
        },
      ];
    },
  };
}
