import { cn } from "@/lib/utils";

const INVOICE_TONE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Émise", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  sent: { label: "Envoyée", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  viewed: { label: "Consultée", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  partially_paid: {
    label: "Partiellement payée",
    cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  paid: {
    label: "Payée",
    cls: "bg-[color:var(--facturation-soft)] text-[color:var(--facturation)] font-semibold",
  },
  rejected: { label: "Refusée", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  cancelled: { label: "Annulée", cls: "bg-zinc-500/20 text-zinc-700 line-through" },
  archived: { label: "Archivée", cls: "bg-slate-500/15 text-slate-600" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const m = INVOICE_TONE[status] ?? { label: status, cls: "bg-muted" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}
