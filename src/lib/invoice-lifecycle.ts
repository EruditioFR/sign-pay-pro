/**
 * Invoice lifecycle state machine.
 *
 * Centralizes allowed transitions, presentation tones and i18n keys for
 * invoice-type documents. Designed to stay compatible with the broader
 * `document_status` enum used by non-invoice documents (quotes, contracts…).
 *
 * Lifecycle (B2B / e-invoicing oriented):
 *
 *   draft ──► issued ──► sent ──► viewed ──► partially_paid ──► paid
 *     │         │          │         │              │
 *     │         └──► rejected ◄──────┘              │
 *     │                                             │
 *     └──► cancelled                                │
 *                                                   ▼
 *                                               archived
 *
 * - `draft`             : édition libre, non émis légalement
 * - `issued`            : émis (numéro figé), prêt à être envoyé
 * - `sent`              : transmis au client
 * - `viewed`            : consulté par le destinataire (tracking lien/portail)
 * - `partially_paid`    : encaissement partiel
 * - `paid`              : entièrement réglé
 * - `rejected`          : refusé par le destinataire ou la PDP
 * - `cancelled`         : avoir / annulation
 * - `archived`          : sorti du cycle actif, lecture seule
 *
 * Compatibilité : `pending_validation`, `validated`, `signed` restent
 * supportés pour les autres types de documents.
 */

import type { DocumentStatus } from "@/lib/documents.functions";

export type InvoiceStatus = Extract<
  DocumentStatus,
  | "draft"
  | "issued"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "rejected"
  | "cancelled"
  | "archived"
>;

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "issued",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "rejected",
  "cancelled",
  "archived",
];

/** Allowed forward transitions. Payment-driven transitions
 *  (→ partially_paid / paid) and archive can occur from most active states. */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["issued", "cancelled"],
  issued: ["sent", "rejected", "cancelled", "partially_paid", "paid"],
  sent: ["viewed", "rejected", "partially_paid", "paid", "cancelled"],
  viewed: ["rejected", "partially_paid", "paid", "cancelled"],
  partially_paid: ["paid", "cancelled"],
  paid: ["archived"],
  rejected: ["issued", "cancelled", "archived"],
  cancelled: ["archived"],
  archived: [],
};

export function canTransition(from: string, to: string): boolean {
  if (!isInvoiceStatus(from) || !isInvoiceStatus(to)) return false;
  if (from === to) return true;
  return INVOICE_TRANSITIONS[from].includes(to);
}

export function isInvoiceStatus(s: string | null | undefined): s is InvoiceStatus {
  return !!s && (INVOICE_STATUSES as string[]).includes(s);
}

/** Statuts considérés comme "actifs" (apparaissent dans le pipeline). */
export const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "issued",
  "sent",
  "viewed",
  "partially_paid",
];

/** Tones partagés UI (Tailwind). */
export const INVOICE_STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  issued: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  viewed: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  partially_paid: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  paid: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  cancelled: "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300 line-through",
  archived: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

/** Returns the list of transitions a user can trigger manually
 *  (excludes payment-driven and view-tracking transitions). */
export function manualNextStatuses(current: string): InvoiceStatus[] {
  if (!isInvoiceStatus(current)) return [];
  const auto = new Set<InvoiceStatus>(["viewed", "partially_paid", "paid"]);
  return INVOICE_TRANSITIONS[current].filter((s) => !auto.has(s));
}
