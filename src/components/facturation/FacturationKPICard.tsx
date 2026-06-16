import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function FacturationKPICard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "accent" | "warn";
}) {
  return (
    <Card
      className={cn(
        "border",
        tone === "accent" &&
          "border-[color:var(--facturation)]/30 bg-[color:var(--facturation-soft)]/40",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {icon && (
            <span
              className={cn(
                "text-muted-foreground",
                tone === "accent" && "text-[color:var(--facturation)]",
              )}
            >
              {icon}
            </span>
          )}
        </div>
        <div
          className={cn(
            "mt-2 text-2xl font-semibold",
            tone === "accent" && "text-[color:var(--facturation)]",
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function formatEUR(n: number | null | undefined) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(v);
}
