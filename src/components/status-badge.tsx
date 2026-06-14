import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const statusVariant: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_validation: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  validated: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  issued: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  viewed: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  signed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  paid: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
  partially_paid: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  archived: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  cancelled: "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300 line-through",
};

const stepVariant: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  skipped: "bg-slate-500/15 text-slate-500 dark:text-slate-300",
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={cn("border-0 font-medium", statusVariant[status])}>
      {t(`documents.status.${status}`)}
    </Badge>
  );
}

export function StepStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={cn("border-0 font-medium", stepVariant[status])}>
      {t(`workflows.step_status.${status}`)}
    </Badge>
  );
}
