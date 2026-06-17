/**
 * Document State Machine
 * ----------------------
 * Source de vérité unique pour le cycle de vie d'un document.
 *
 * Flow principal :
 *
 *   draft → sent → signed → paid → archived
 *     \      \       \       /
 *      \______\_______\_____/────► cancelled
 *
 * Statuts auxiliaires conservés (compat existant) :
 *   - pending_validation / validated / rejected : workflow d'approbation interne
 *   - issued / viewed : étapes émission / consultation lien public
 *   - partially_paid : agrégat paiements (calculé par trigger SQL)
 *
 * Statuts terminaux (lecture seule) : archived, cancelled
 *
 * Toutes les transitions doivent passer par `assertCanTransition` côté serveur
 * et être journalisées via `buildTransitionAuditEntry`.
 */

export type DocumentStatus =
  | "draft"
  | "pending_validation"
  | "validated"
  | "rejected"
  | "issued"
  | "sent"
  | "viewed"
  | "signed"
  | "paid"
  | "partially_paid"
  | "archived"
  | "cancelled";

/** Statuts terminaux : aucune transition sortante hors désarchivage explicite. */
export const TERMINAL_STATUSES: readonly DocumentStatus[] = ["archived", "cancelled"] as const;

/** Statuts en lecture seule : pas de modification, pas de signature, pas de paiement. */
export const READ_ONLY_STATUSES: readonly DocumentStatus[] = ["archived", "cancelled"] as const;

/** Transitions autorisées : from → to[] */
export const ALLOWED_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  draft:              ["pending_validation", "validated", "sent", "cancelled", "archived"],
  pending_validation: ["validated", "rejected", "cancelled"],
  validated:          ["sent", "issued", "cancelled", "archived"],
  rejected:           ["draft", "cancelled", "archived"],
  issued:             ["sent", "viewed", "signed", "paid", "partially_paid", "cancelled", "archived"],
  sent:               ["viewed", "signed", "paid", "partially_paid", "cancelled", "archived"],
  viewed:             ["signed", "paid", "partially_paid", "sent", "cancelled", "archived"],
  signed:             ["paid", "partially_paid", "archived"],
  partially_paid:     ["paid", "archived"],
  paid:               ["archived"],
  archived:           [], // sortie via unarchive (restaure previous_status)
  cancelled:          ["archived"],
};

/** Statuts qui peuvent être annulés par un utilisateur. */
export const CANCELLABLE_STATUSES: readonly DocumentStatus[] = [
  "draft",
  "pending_validation",
  "validated",
  "rejected",
  "issued",
  "sent",
  "viewed",
  "partially_paid",
];

export function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isReadOnlyStatus(status: string | null | undefined): boolean {
  return !!status && (READ_ONLY_STATUSES as readonly string[]).includes(status);
}

export function canTransition(from: string, to: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[from as DocumentStatus];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}

export function assertCanTransition(from: string, to: string): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new Error(
      `Transition de statut invalide : « ${from} » → « ${to} ».`,
    );
  }
}

/** Le document peut-il encore être modifié (édition des champs métier) ? */
export function canModify(status: string | null | undefined): boolean {
  return !isReadOnlyStatus(status);
}

/** Une nouvelle signature peut-elle être demandée / enregistrée ? */
export function canRequestSignature(status: string | null | undefined): boolean {
  if (isReadOnlyStatus(status)) return false;
  // Pas de re-signature une fois le document signé ou payé : le PDF est verrouillé.
  return status !== "paid" && status !== "signed";
}

/** Un paiement (manuel ou Stripe) peut-il être enregistré ? */
export function canRecordPayment(status: string | null | undefined): boolean {
  if (isReadOnlyStatus(status)) return false;
  return status !== "paid";
}

/** Un document peut-il être archivé manuellement par l'utilisateur ? */
export function canArchive(status: string | null | undefined): boolean {
  if (!status) return false;
  if (status === "archived") return false;
  // cancelled non archivable (cohérent avec règle métier existante)
  if (status === "cancelled") return false;
  return true;
}

/** Un document peut-il être annulé ? */
export function canCancel(status: string | null | undefined): boolean {
  return !!status && (CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

/** Liste des prochains statuts atteignables — utile pour UI / suggestions. */
export function nextAllowed(status: string): readonly DocumentStatus[] {
  return ALLOWED_TRANSITIONS[status as DocumentStatus] ?? [];
}

/**
 * Construit l'entrée à insérer dans `audit_logs` pour tracer une transition.
 * Reste un POJO pour rester compatible serveur (createServerFn) et client.
 */
export function buildTransitionAuditEntry(args: {
  organization_id: string;
  user_id: string | null;
  document_id: string;
  from: string;
  to: string;
  reason?: string | null;
  extra?: Record<string, unknown>;
}) {
  return {
    organization_id: args.organization_id,
    user_id: args.user_id,
    action: `document.transition.${args.to}`,
    resource: `document:${args.document_id}`,
    metadata: {
      from: args.from,
      to: args.to,
      reason: args.reason ?? null,
      ...(args.extra ?? {}),
    },
  };
}
