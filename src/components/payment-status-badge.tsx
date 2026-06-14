import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  computePaymentSummary,
  type PaymentBadgeStatus,
  type PaymentSummaryInput,
} from "@/lib/payment-status";

const TONE: Record<PaymentBadgeStatus, string> = {
  paid: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
  partially_paid: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  unpaid: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  refunded: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  not_applicable: "bg-muted text-muted-foreground",
};

export function PaymentStatusBadge(
  props: PaymentSummaryInput & { className?: string; hideWhenNotApplicable?: boolean },
) {
  const { t } = useTranslation();
  const { className, hideWhenNotApplicable, ...input } = props;
  const summary = computePaymentSummary(input);
  if (hideWhenNotApplicable && summary.status === "not_applicable") return null;

  const label = t(`payment_status.${summary.status}`, {
    defaultValue: defaultLabel(summary.status),
  });

  return (
    <Badge
      variant="outline"
      className={cn("border-0 font-medium", TONE[summary.status], className)}
      title={tooltip(summary, t)}
    >
      {label}
    </Badge>
  );
}

function defaultLabel(s: PaymentBadgeStatus): string {
  switch (s) {
    case "paid": return "Payé";
    case "partially_paid": return "Partiellement payé";
    case "unpaid": return "Impayé";
    case "overdue": return "En retard";
    case "refunded": return "Remboursé";
    case "not_applicable": return "—";
  }
}

function tooltip(
  s: ReturnType<typeof computePaymentSummary>,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  if (s.status === "not_applicable") return "";
  const parts = [
    `${t("payment_status.tooltip.paid", { defaultValue: "Payé" })}: ${s.paidAmount}`,
    `${t("payment_status.tooltip.due", { defaultValue: "Dû" })}: ${s.dueAmount}`,
  ];
  if (s.remaining > 0) {
    parts.push(`${t("payment_status.tooltip.remaining", { defaultValue: "Restant" })}: ${s.remaining}`);
  }
  return parts.join(" · ");
}
