import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

export type TemplateStep = {
  position: number;
  name: string;
  approver_role: "super_admin" | "reseller" | "admin_client" | "manager" | "user" | null;
  approver_user_id: string | null;
  required: boolean;
};

export type TemplatePayload = {
  name: string;
  document_type: "purchase_order" | "quote" | "invoice" | "contract" | "other" | null;
  active: boolean;
  steps: TemplateStep[];
};

interface Props {
  initial?: Partial<TemplatePayload>;
  submitLabel: string;
  onSubmit: (payload: TemplatePayload) => Promise<void> | void;
  busy?: boolean;
}

const ROLES = ["admin_client", "manager", "user"] as const;
const DOC_TYPES = ["purchase_order", "quote", "invoice", "contract", "other"] as const;

export function WorkflowTemplateEditor({ initial, submitLabel, onSubmit, busy }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [docType, setDocType] = useState<TemplatePayload["document_type"]>(
    initial?.document_type ?? null
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [steps, setSteps] = useState<TemplateStep[]>(
    initial?.steps?.length
      ? [...initial.steps].sort((a, b) => a.position - b.position)
      : [{ position: 1, name: "Validation", approver_role: "admin_client", approver_user_id: null, required: true }]
  );

  const addStep = () =>
    setSteps((s) => [
      ...s,
      { position: s.length + 1, name: "", approver_role: "manager", approver_user_id: null, required: true },
    ]);
  const removeStep = (i: number) =>
    setSteps((s) => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, position: idx + 1 })));
  const update = (i: number, patch: Partial<TemplateStep>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, document_type: docType, active, steps });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name">{t("documents.field.title")}</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("documents.field.type")}</Label>
          <Select
            value={docType ?? "any"}
            onValueChange={(v) => setDocType(v === "any" ? null : (v as TemplatePayload["document_type"]))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">—</SelectItem>
              {DOC_TYPES.map((d) => (
                <SelectItem key={d} value={d}>{t(`documents.types.${d}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={active} onCheckedChange={setActive} id="tpl-active" />
          <Label htmlFor="tpl-active">{t("users.active")}</Label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t("workflows.title")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="mr-1 h-4 w-4" />+
          </Button>
        </div>

        {steps.map((step, i) => (
          <Card key={i}>
            <CardContent className="grid gap-3 p-4 md:grid-cols-12">
              <div className="md:col-span-1 flex items-center text-sm font-medium text-muted-foreground">#{step.position}</div>
              <div className="md:col-span-4">
                <Input
                  placeholder="Nom de l'étape"
                  value={step.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  required
                  maxLength={100}
                />
              </div>
              <div className="md:col-span-3">
                <Select
                  value={step.approver_role ?? "admin_client"}
                  onValueChange={(v) => update(i, { approver_role: v as TemplateStep["approver_role"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3 flex items-center gap-2">
                <Switch
                  checked={step.required}
                  onCheckedChange={(c) => update(i, { required: c })}
                  id={`req-${i}`}
                />
                <Label htmlFor={`req-${i}`} className="text-xs">
                  {step.required ? "Requise" : t("workflows.optional")}
                </Label>
              </div>
              <div className="md:col-span-1 flex justify-end">
                {steps.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeStep(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? t("common.loading") : submitLabel}
      </Button>
    </form>
  );
}
