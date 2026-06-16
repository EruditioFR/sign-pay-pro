import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { formatEUR } from "@/components/facturation/FacturationKPICard";

export type LineDraft = {
  description: string;
  quantity: number;
  unit_price_ht: number;
  vat_rate: number;
  discount_pct: number;
};

export const emptyLine = (): LineDraft => ({
  description: "",
  quantity: 1,
  unit_price_ht: 0,
  vat_rate: 20,
  discount_pct: 0,
});

const VAT_OPTIONS = [0, 5.5, 10, 20];

function computeLineTotals(l: LineDraft) {
  const gross = l.quantity * l.unit_price_ht;
  const ht = Math.round(gross * (1 - (l.discount_pct || 0) / 100) * 100) / 100;
  const vat = Math.round(ht * (l.vat_rate / 100) * 100) / 100;
  return { ht, vat, ttc: Math.round((ht + vat) * 100) / 100 };
}

export function computeTotals(lines: LineDraft[]) {
  let ht = 0;
  let vat = 0;
  const byRate = new Map<number, { base: number; vat: number }>();
  for (const l of lines) {
    const t = computeLineTotals(l);
    ht += t.ht;
    vat += t.vat;
    const b = byRate.get(l.vat_rate) ?? { base: 0, vat: 0 };
    b.base += t.ht;
    b.vat += t.vat;
    byRate.set(l.vat_rate, b);
  }
  return {
    ht: Math.round(ht * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    ttc: Math.round((ht + vat) * 100) / 100,
    byRate: Array.from(byRate.entries()).map(([rate, v]) => ({
      rate,
      base: Math.round(v.base * 100) / 100,
      vat: Math.round(v.vat * 100) / 100,
    })),
  };
}

export function InvoiceLineItems({
  value,
  onChange,
  disabled,
}: {
  value: LineDraft[];
  onChange: (next: LineDraft[]) => void;
  disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<LineDraft>) => {
    onChange(value.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const add = () => onChange([...value, emptyLine()]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="w-20 text-right">Qté</TableHead>
            <TableHead className="w-32 text-right">Prix unit. HT</TableHead>
            <TableHead className="w-24">TVA</TableHead>
            <TableHead className="w-24 text-right">Remise %</TableHead>
            <TableHead className="w-32 text-right">Total HT</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                Aucune ligne. Ajoutez une première ligne.
              </TableCell>
            </TableRow>
          )}
          {value.map((l, i) => {
            const t = computeLineTotals(l);
            return (
              <TableRow key={i}>
                <TableCell>
                  <Input
                    value={l.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    placeholder="Désignation"
                    disabled={disabled}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={l.quantity}
                    onChange={(e) => update(i, { quantity: Number(e.target.value) || 0 })}
                    className="text-right"
                    disabled={disabled}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={l.unit_price_ht}
                    onChange={(e) =>
                      update(i, { unit_price_ht: Number(e.target.value) || 0 })
                    }
                    className="text-right"
                    disabled={disabled}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={String(l.vat_rate)}
                    onValueChange={(v) => update(i, { vat_rate: Number(v) })}
                    disabled={disabled}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_OPTIONS.map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {r}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    max={100}
                    value={l.discount_pct}
                    onChange={(e) =>
                      update(i, { discount_pct: Number(e.target.value) || 0 })
                    }
                    className="text-right"
                    disabled={disabled}
                  />
                </TableCell>
                <TableCell className="text-right font-medium">{formatEUR(t.ht)}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(i)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
        <Plus className="mr-1 h-4 w-4" /> Ajouter une ligne
      </Button>
    </div>
  );
}

export function InvoiceTotals({ lines }: { lines: LineDraft[] }) {
  const totals = useMemo(() => computeTotals(lines), [lines]);
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="flex justify-between py-1">
        <span className="text-muted-foreground">Sous-total HT</span>
        <span className="font-medium">{formatEUR(totals.ht)}</span>
      </div>
      {totals.byRate.map((b) => (
        <div className="flex justify-between py-0.5 text-xs text-muted-foreground" key={b.rate}>
          <span>TVA {b.rate}% (base {formatEUR(b.base)})</span>
          <span>{formatEUR(b.vat)}</span>
        </div>
      ))}
      <div className="flex justify-between py-1 border-t border-border mt-1 pt-2">
        <span className="text-muted-foreground">Total TVA</span>
        <span className="font-medium">{formatEUR(totals.vat)}</span>
      </div>
      <div className="flex justify-between py-1 text-base">
        <span className="font-semibold">Total TTC</span>
        <span className="font-bold text-[color:var(--facturation)]">
          {formatEUR(totals.ttc)}
        </span>
      </div>
    </div>
  );
}

// Small helper hook to scaffold a draft form
export function useDocumentFormDraft(initial?: {
  title?: string;
  third_party_name?: string;
  third_party_email?: string;
  description?: string;
  issue_date?: string;
  due_date?: string;
  payment_terms?: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [client, setClient] = useState(initial?.third_party_name ?? "");
  const [email, setEmail] = useState(initial?.third_party_email ?? "");
  const [obj, setObj] = useState(initial?.description ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const in30 = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();
  const [issueDate, setIssueDate] = useState(initial?.issue_date ?? today);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? in30);
  const [terms, setTerms] = useState(initial?.payment_terms ?? "");
  useEffect(() => {
    if (initial?.title !== undefined) setTitle(initial.title);
    if (initial?.third_party_name !== undefined) setClient(initial.third_party_name);
    if (initial?.third_party_email !== undefined) setEmail(initial.third_party_email);
    if (initial?.description !== undefined) setObj(initial.description);
    if (initial?.issue_date) setIssueDate(initial.issue_date);
    if (initial?.due_date) setDueDate(initial.due_date);
    if (initial?.payment_terms !== undefined) setTerms(initial.payment_terms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initial?.title,
    initial?.third_party_name,
    initial?.third_party_email,
    initial?.description,
    initial?.issue_date,
    initial?.due_date,
    initial?.payment_terms,
  ]);
  return {
    title, setTitle, client, setClient, email, setEmail, obj, setObj,
    issueDate, setIssueDate, dueDate, setDueDate, terms, setTerms,
  };
}

// Re-export common atoms
export { Label, Input, Textarea };
