import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TemplateFormValues {
  name: string;
  document_type: string | null;
  logo_url: string;
  primary_color: string;
  legal_mentions: string;
  payment_terms: string;
  iban: string;
  bic: string;
  vat_number: string;
  active: boolean;
  is_default: boolean;
}

const TYPES = ["purchase_order", "quote", "invoice", "contract", "other"] as const;

export function TemplateForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Partial<TemplateFormValues>;
  onSubmit: (v: TemplateFormValues) => void;
  submitting?: boolean;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState<TemplateFormValues>({
    name: initial?.name ?? "",
    document_type: initial?.document_type ?? null,
    logo_url: initial?.logo_url ?? "",
    primary_color: initial?.primary_color ?? "#1f2937",
    legal_mentions: initial?.legal_mentions ?? "",
    payment_terms: initial?.payment_terms ?? "",
    iban: initial?.iban ?? "",
    bic: initial?.bic ?? "",
    vat_number: initial?.vat_number ?? "",
    active: initial?.active ?? true,
    is_default: initial?.is_default ?? false,
  });

  const set = <K extends keyof TemplateFormValues>(k: K, val: TemplateFormValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("templates.name")}</Label>
          <Input value={v.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("templates.type")}</Label>
          <Select
            value={v.document_type ?? "any"}
            onValueChange={(val) => set("document_type", val === "any" ? null : val)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">—</SelectItem>
              {TYPES.map((tt) => (
                <SelectItem key={tt} value={tt}>{t(`documents.types.${tt}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("templates.logo_url")}</Label>
          <Input value={v.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-1.5">
          <Label>{t("templates.primary_color")}</Label>
          <Input type="color" value={v.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="h-10 w-24" />
        </div>
        <div className="space-y-1.5">
          <Label>{t("templates.iban")}</Label>
          <Input value={v.iban} onChange={(e) => set("iban", e.target.value)} maxLength={50} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("templates.bic")}</Label>
          <Input value={v.bic} onChange={(e) => set("bic", e.target.value)} maxLength={20} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("templates.vat_number")}</Label>
          <Input value={v.vat_number} onChange={(e) => set("vat_number", e.target.value)} maxLength={40} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("templates.payment_terms")}</Label>
        <Textarea value={v.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} rows={2} maxLength={2000} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("templates.legal_mentions")}</Label>
        <Textarea value={v.legal_mentions} onChange={(e) => set("legal_mentions", e.target.value)} rows={3} maxLength={5000} />
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} />
          <Label>{t("templates.active")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={v.is_default} onCheckedChange={(c) => set("is_default", c)} />
          <Label>{t("templates.is_default")}</Label>
        </div>
      </div>
      <Button type="submit" disabled={submitting}>{t("common.save")}</Button>
    </form>
  );
}
