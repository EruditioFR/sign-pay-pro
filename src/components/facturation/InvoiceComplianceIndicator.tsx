import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  type ComplianceCheck,
  complianceSummary,
} from "@/lib/invoice-compliance";

const LEVEL_LABEL: Record<ComplianceCheck["level"], string> = {
  required: "Obligatoires",
  recommended: "Recommandées",
  electronic_2026: "Facturation électronique 2026",
};

const LEVEL_ORDER: ComplianceCheck["level"][] = [
  "required",
  "recommended",
  "electronic_2026",
];

interface Props {
  checks: ComplianceCheck[];
  compact?: boolean;
  className?: string;
}

export function InvoiceComplianceIndicator({ checks, compact, className }: Props) {
  const summary = complianceSummary(checks);
  const variant =
    summary.status === "ok"
      ? {
          icon: <CheckCircle2 className="h-4 w-4" />,
          label: "Conforme",
          tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
        }
      : summary.status === "partial"
      ? {
          icon: <AlertTriangle className="h-4 w-4" />,
          label: "Partiellement conforme",
          tone: "bg-amber-500/10 text-amber-600 border-amber-500/30",
        }
      : {
          icon: <XCircle className="h-4 w-4" />,
          label: "Non conforme",
          tone: "bg-red-500/10 text-red-600 border-red-500/30",
        };

  const grouped = LEVEL_ORDER.map((lvl) => ({
    level: lvl,
    items: checks.filter((c) => c.level === lvl),
  })).filter((g) => g.items.length > 0);

  const trigger = (
    <Badge
      variant="outline"
      className={[
        "gap-1 cursor-help border",
        variant.tone,
        compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className ?? "",
      ].join(" ")}
    >
      {variant.icon}
      <span>{variant.label}</span>
      {!compact && (
        <span className="text-muted-foreground font-normal ml-1">
          {summary.requiredSatisfied}/{summary.requiredTotal} obligatoires
        </span>
      )}
    </Badge>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex">{trigger}</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-h-[70vh] overflow-y-auto">
        <div className="space-y-3">
          <div className="text-sm font-semibold">Mentions légales</div>
          {grouped.map((g) => (
            <div key={g.level} className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {LEVEL_LABEL[g.level]}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((c) => (
                  <li
                    key={c.field}
                    className="flex items-start gap-2 text-xs leading-snug"
                  >
                    {c.satisfied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    ) : g.level === "required" ? (
                      <XCircle className="h-3.5 w-3.5 mt-0.5 text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className={c.satisfied ? "text-muted-foreground line-through" : "text-foreground"}>
                        {c.label}
                      </div>
                      {c.message && (
                        <div className="text-muted-foreground flex items-start gap-1 mt-0.5">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{c.message}</span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
