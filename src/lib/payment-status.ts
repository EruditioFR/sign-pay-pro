/**
 * Centralized payment-status logic for documents.
 *
 * SINGLE source of truth for computing a document's payment situation
 * from its TTC amount, due date, document status, and `document_payments`
 * rows (manual + Stripe + refunds).
 *
 * Used by:
 *  - document list (search RPC: payments_total + amount_ttc + due_date + status)
 *  - document detail page (full payments rows)
 *  - dashboard / analytics widgets
 *
 * Never duplicate this logic inline in components — extend this module instead.
 */

export type PaymentBadgeStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "refunded"
  | "not_applicable";

/** Document statuses that freeze payment computation (read-only documents). */
const READ_ONLY_DOC_STATUSES = new Set(["archived", "cancelled"]);

/** Subset of `document_payments` columns required for paid-amount math. */
export interface PaymentRowLike {
  amount: number | string;
  status: string;
  metadata?: unknown;
}

/**
 * Sum the *effective* paid amount from a list of payment rows.
 *
 * - `succeeded` payments count fully
 * - `partially_refunded` count as (amount − metadata.refunded_amount)
 * - `refunded` count as 0
 * - any other status (pending / failed / canceled) is ignored
 */
export function computePaidAmount(payments: PaymentRowLike[] | null | undefined): number {
  if (!payments?.length) return 0;
  let total = 0;
  for (const p of payments) {
    const amount = Number(p.amount ?? 0) || 0;
    if (p.status === "succeeded") {
      total += amount;
    } else if (p.status === "partially_refunded") {
      const meta = (p.metadata && typeof p.metadata === "object")
        ? (p.metadata as Record<string, unknown>)
        : {};
      const refunded = Number(meta.refunded_amount ?? 0) || 0;
      total += Math.max(0, amount - refunded);
    }
    // 'refunded', 'pending', 'failed', 'canceled' → contribute 0
  }
  return roundCurrency(total);
}

/** Whether at least one payment row has a refund-related status. */
export function hasRefundActivity(payments: PaymentRowLike[] | null | undefined): boolean {
  return !!payments?.some((p) => p.status === "refunded" || p.status === "partially_refunded");
}

export interface PaymentSummaryInput {
  /** Document.status — used to short-circuit on archived / cancelled. */
  documentStatus?: string | null;
  /** Document.amount_ttc (preferred) or amount_ht as fallback. */
  amountTtc?: number | string | null;
  /** Document.due_date (ISO YYYY-MM-DD). */
  dueDate?: string | null;
  /**
   * Pre-computed total of successful payments (e.g. from search RPC
   * `payments_total`). Used when full `payments` rows aren't loaded.
   */
  paidAmount?: number | string | null;
  /** Full `document_payments` rows when available — takes precedence over `paidAmount`. */
  payments?: PaymentRowLike[] | null;
  /** Override for "today" — useful for tests. */
  now?: Date;
}

export interface PaymentSummary {
  status: PaymentBadgeStatus;
  paidAmount: number;
  dueAmount: number;
  remaining: number;
  isOverdue: boolean;
  hasRefund: boolean;
}

/**
 * Compute the payment situation of a document.
 *
 * Precedence:
 *  1. archived / cancelled → `not_applicable`
 *  2. fully refunded with no remaining paid amount → `refunded`
 *  3. paidAmount ≥ dueAmount (and dueAmount > 0) → `paid`
 *  4. paidAmount > 0 → `partially_paid`
 *  5. due_date passed → `overdue`
 *  6. otherwise → `unpaid`
 *
 * `dueAmount = 0` (no TTC set) collapses to `paid` if anything was paid,
 * else `unpaid` (never overdue).
 */
export function computePaymentSummary(input: PaymentSummaryInput): PaymentSummary {
  const dueAmount = roundCurrency(Number(input.amountTtc ?? 0) || 0);

  const paidAmount = input.payments
    ? computePaidAmount(input.payments)
    : roundCurrency(Number(input.paidAmount ?? 0) || 0);

  const hasRefund = input.payments ? hasRefundActivity(input.payments) : false;
  const remaining = roundCurrency(Math.max(0, dueAmount - paidAmount));

  if (input.documentStatus && READ_ONLY_DOC_STATUSES.has(input.documentStatus)) {
    return {
      status: "not_applicable",
      paidAmount,
      dueAmount,
      remaining,
      isOverdue: false,
      hasRefund,
    };
  }

  const today = input.now ?? new Date();
  const isOverdue =
    !!input.dueDate &&
    paidAmount < dueAmount &&
    new Date(`${input.dueDate}T23:59:59`) < today;

  let status: PaymentBadgeStatus;
  if (hasRefund && paidAmount <= 0) {
    status = "refunded";
  } else if (dueAmount > 0 && paidAmount >= dueAmount) {
    status = "paid";
  } else if (paidAmount > 0) {
    // partial payment trumps overdue visually — but flag isOverdue separately
    status = isOverdue ? "overdue" : "partially_paid";
  } else if (isOverdue) {
    status = "overdue";
  } else if (dueAmount === 0) {
    status = "not_applicable";
  } else {
    status = "unpaid";
  }

  return { status, paidAmount, dueAmount, remaining, isOverdue, hasRefund };
}

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}
