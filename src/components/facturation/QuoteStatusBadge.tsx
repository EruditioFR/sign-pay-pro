import { cn } from "@/lib/utils";

const QUOTE_TONE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
  pending_validation: { label: "À valider", cls: "bg-amber-500/15 text-amber-700" },
  validated: { label: "Validé", cls: "bg-blue-500/15 text-blue-700" },
  issued: { label: "Émis", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  sent: { label: "Envoyé", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  viewed: { label: "Consulté", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  signed: { label: "Signé", cls: "bg-[color:var(--facturation-soft)] text-[color:var(--facturation)]" },
  rejected: { label: "Refusé", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  paid: {
    label: "Accepté",
    cls: "bg-[color:var(--facturation-soft)] text-[color:var(--facturation)]",
  },
  archived: { label: "Archivé", cls: "bg-slate-500/15 text-slate-600" },
  cancelled: { label: "Annulé", cls: "bg-zinc-500/20 text-zinc-700 line-through" },
};

export function QuoteStatusBadge({ status }: { status: string }) {
  const m = QUOTE_TONE[status] ?? { label: status, cls: "bg-muted" };
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
