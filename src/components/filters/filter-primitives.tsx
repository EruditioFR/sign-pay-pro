/**
 * Reusable, framework-agnostic filter UI primitives.
 *
 * Designed to be composed inside any "filters bar" (documents, signatures,
 * payments, …). They expose minimal props and rely on the design system
 * tokens — never custom colors.
 */

import * as React from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </Label>
      {children}
    </div>
  );
}

export function FilterToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-2 py-1 text-xs transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export interface FilterChip {
  key: string;
  label: string;
  clear: () => void;
}

export function FilterChips({
  chips,
  onReset,
  resetLabel = "Réinitialiser",
}: {
  chips: FilterChip[];
  onReset?: () => void;
  resetLabel?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1 pr-1">
          {c.label}
          <button
            onClick={c.clear}
            className="ml-1 rounded hover:bg-background/50"
            aria-label="clear"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {onReset && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onReset}
        >
          {resetLabel}
        </Button>
      )}
    </div>
  );
}

export function FilterResultCount({
  count,
  loading,
  zeroLabel = "Aucun résultat",
  oneLabel = "1 résultat",
  manyLabel,
}: {
  count: number | undefined;
  loading?: boolean;
  zeroLabel?: string;
  oneLabel?: string;
  manyLabel?: (n: number) => string;
}) {
  if (loading && count == null) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  const n = count ?? 0;
  let label = zeroLabel;
  if (n === 1) label = oneLabel;
  else if (n > 1) label = manyLabel ? manyLabel(n) : `${n} résultats`;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
  );
}
