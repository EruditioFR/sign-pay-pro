/**
 * PDP (Plateforme de Dématérialisation Partenaire) — connector contracts.
 *
 * Ces interfaces décrivent le contrat minimal qu'un futur connecteur PDP
 * devra implémenter pour transmettre des factures électroniques.
 *
 * Aucune intégration réseau n'est faite ici : on isole le vocabulaire et
 * les types pour que la logique métier (génération XML, file d'envoi,
 * audit) puisse être écrite et testée sans dépendre d'un fournisseur.
 *
 * Le connecteur par défaut (`noop`) ne fait que simuler la file et permet
 * de développer toute l'UI / les transitions sans contrat PDP signé.
 */

import type { EinvoiceFormat } from "@/lib/einvoice";

export type TransmissionStatus =
  | "queued"
  | "sending"
  | "transmitted"
  | "error"
  | "cancelled";

/** Identifiant logique d'un connecteur (ex: "noop", "chorus_pro", "iopole"). */
export type PdpProviderId = string;

/** Charge utile minimale à transmettre à une PDP. */
export interface PdpInvoicePayload {
  /** UUID interne de la facture (table `documents`). */
  documentId: string;
  /** Numéro de facture officiel (immutable une fois émis). */
  invoiceNumber: string;
  /** Format du fichier structuré joint. */
  format: EinvoiceFormat;
  /** XML / JSON structuré (chaîne brute) ou référence (`payload_ref`). */
  structuredContent?: string;
  /** PDF associé (URL signée, base64 ou chemin storage). */
  pdfRef?: string;
  /** Données minimales utiles côté PDP pour routage. */
  buyer: {
    legalName: string;
    siret?: string | null;
    vatNumber?: string | null;
  };
  seller: {
    legalName: string;
    siret?: string | null;
    vatNumber?: string | null;
  };
  totals: {
    amountHt: number;
    amountTtc: number;
    totalVat: number;
    currency: string;
  };
  /** Hash idempotent : permet à la PDP / au connecteur d'éviter les doublons. */
  idempotencyKey: string;
}

export interface PdpSubmissionResult {
  /** Identifiant remote (numéro de dépôt PDP). */
  remoteId: string;
  /** Statut renvoyé immédiatement (souvent `sending` ou `transmitted`). */
  status: TransmissionStatus;
  /** Message libre (à journaliser). */
  message?: string;
}

export interface PdpStatusResult {
  status: TransmissionStatus;
  remoteId?: string;
  message?: string;
  /** Statut e-invoicing métier renvoyé par la plateforme si disponible. */
  einvoiceStatus?:
    | "submitted"
    | "received"
    | "accepted"
    | "rejected"
    | "in_dispute"
    | "paid";
}

/** Contrat qu'un futur connecteur PDP doit implémenter. */
export interface PdpConnector {
  readonly id: PdpProviderId;
  readonly displayName: string;
  /** Formats acceptés en entrée par la PDP. */
  readonly supportedFormats: EinvoiceFormat[];

  /** Vérifie la configuration (clé API, certificat, etc.). */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;

  /** Dépose la facture sur la PDP. Doit être idempotent (cf. `idempotencyKey`). */
  submit(payload: PdpInvoicePayload): Promise<PdpSubmissionResult>;

  /** Interroge la PDP pour récupérer l'état d'une transmission. */
  fetchStatus(remoteId: string): Promise<PdpStatusResult>;

  /** Annule une transmission encore en file côté PDP (best effort). */
  cancel?(remoteId: string): Promise<void>;
}
