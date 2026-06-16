// Shared 4-step stepper for quote & invoice creation/edition.
// Mandatory mentions per Art. L441-9 C.com + CGI.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  InvoiceLineItems, InvoiceTotals, computeTotals, type LineDraft,
} from "@/components/facturation/InvoiceLineItems";
import { InvoiceComplianceIndicator } from "@/components/facturation/InvoiceComplianceIndicator";
import {
  buildLegalMentions, checkInvoiceCompliance,
  type OrgProfile, type InvoiceDoc,
} from "@/lib/invoice-compliance";
import { formatEUR } from "@/components/facturation/FacturationKPICard";

export type StepperDoc = {
  // Step 1 — Recipient (issuer is taken from org profile)
  third_party_name: string;
  third_party_email: string;
  client_legal_form: string;
  client_reference: string;
  buyer_siret: string;
  buyer_vat_number: string;
  buyer_address: string;           // free text address (stored as jsonb { line: ... })
  client_delivery_address: string;
  // Step 2 — Document info
  title: string;
  description: string;
  issue_date: string;
  service_date: string;
  due_date: string;
  validity_date: string;
  transaction_type: string;        // B2B / B2C / B2G
  payment_terms: string;
  payment_bank_details: string;
  late_penalty_rate: string;
  recovery_indemnity: string;
  early_discount_text: string;
  // Step 3 — Lines
  lines: LineDraft[];
  advance_paid: string;
  // Step 4 — Mentions
  header_note: string;
  footer_note: string;
  internal_note: string;
  legal_mentions: string;
  // editing mode info
  document_number: string | null;
};

export const emptyStepperDoc = (org?: OrgProfile | null): StepperDoc => {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  return {
    third_party_name: "", third_party_email: "",
    client_legal_form: "", client_reference: "",
    buyer_siret: "", buyer_vat_number: "",
    buyer_address: "", client_delivery_address: "",
    title: "", description: "",
    issue_date: today, service_date: "", due_date: in30, validity_date: in30,
    transaction_type: "B2B",
    payment_terms: org?.default_payment_terms ?? "Paiement à 30 jours fin de mois",
    payment_bank_details:
      org?.iban
        ? `IBAN : ${org.iban}${org.bic ? ` — BIC : ${org.bic}` : ""}`
        : "",
    late_penalty_rate: org?.late_penalty_rate != null ? String(org.late_penalty_rate) : "12",
    recovery_indemnity: org?.recovery_indemnity != null ? String(org.recovery_indemnity) : "40",
    early_discount_text: org?.default_early_discount ?? "Pas d'escompte pour paiement anticipé",
    lines: [],
    advance_paid: "0",
    header_note: "", footer_note: "", internal_note: "",
    legal_mentions: "",
    document_number: null,
  };
};

const TRANSACTION_TYPES = ["B2B", "B2C", "B2G"];

interface Props {
  type: "quote" | "invoice";
  org: OrgProfile | null;
  value: StepperDoc;
  onChange: (next: StepperDoc) => void;
  readOnly?: boolean;
  footer?: ReactNode;
  /** Optional initial step (default 1). */
  initialStep?: number;
}

export function DocumentStepperForm({
  type, org, value, onChange, readOnly, footer, initialStep = 1,
}: Props) {
  const [step, setStep] = useState(initialStep);
  const isAE = Boolean(org?.is_autoentrepreneur);

  // Force VAT rate to 0 in auto-entrepreneur mode
  useEffect(() => {
    if (!isAE) return;
    if (value.lines.some((l) => l.vat_rate !== 0)) {
      onChange({
        ...value,
        lines: value.lines.map((l) => ({ ...l, vat_rate: 0 })),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAE, value.lines]);

  const totals = useMemo(() => computeTotals(value.lines), [value.lines]);

  // Build doc snapshot for compliance + mentions
  const docSnapshot: InvoiceDoc = useMemo(() => ({
    id: undefined, type,
    document_number: value.document_number ?? undefined,
    issue_date: value.issue_date, due_date: value.due_date,
    service_date: value.service_date, validity_date: value.validity_date,
    transaction_type: value.transaction_type,
    third_party_name: value.third_party_name,
    third_party_email: value.third_party_email,
    client_legal_form: value.client_legal_form,
    client_reference: value.client_reference,
    client_delivery_address: value.client_delivery_address,
    buyer_siret: value.buyer_siret,
    buyer_vat_number: value.buyer_vat_number,
    buyer_address: value.buyer_address,
    amount_ht: totals.ht, amount_ttc: totals.ttc,
    payment_terms: value.payment_terms,
    payment_bank_details: value.payment_bank_details,
    late_penalty_rate: value.late_penalty_rate ? Number(value.late_penalty_rate) : null,
    recovery_indemnity: value.recovery_indemnity ? Number(value.recovery_indemnity) : null,
    early_discount_text: value.early_discount_text,
    legal_mentions: value.legal_mentions,
    line_count: value.lines.length,
  }), [type, value, totals]);

  const checks = useMemo(
    () => checkInvoiceCompliance(docSnapshot, org),
    [docSnapshot, org],
  );

  // Auto-generate mentions if empty
  useEffect(() => {
    if (value.legal_mentions.trim().length === 0) {
      const generated = buildLegalMentions(org, docSnapshot);
      if (generated && generated !== value.legal_mentions) {
        onChange({ ...value, legal_mentions: generated });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.name, org?.is_autoentrepreneur, org?.legal_form, type]);

  const set = <K extends keyof StepperDoc>(k: K, v: StepperDoc[K]) =>
    onChange({ ...value, [k]: v });

  const advancePaid = Number(value.advance_paid) || 0;
  const netToPay = Math.max(0, totals.ttc - advancePaid);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <InvoiceComplianceIndicator checks={checks} />
      </div>

      <Tabs value={`s${step}`} onValueChange={(v) => setStep(Number(v.slice(1)))}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="s1">1. Émetteur &amp; Client</TabsTrigger>
          <TabsTrigger value="s2">2. Informations</TabsTrigger>
          <TabsTrigger value="s3">3. Lignes &amp; Montants</TabsTrigger>
          <TabsTrigger value="s4">4. Mentions &amp; Final.</TabsTrigger>
        </TabsList>

        {/* ============ STEP 1 ============ */}
        <TabsContent value="s1" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Émetteur (depuis votre profil)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {org?.name ? (
                <>
                  <div className="font-medium">{org.name}</div>
                  {!isAE && org.legal_form && (
                    <div className="text-muted-foreground text-xs">
                      {org.legal_form}
                      {org.share_capital ? ` — Capital ${Number(org.share_capital).toLocaleString("fr-FR")} €` : ""}
                    </div>
                  )}
                  {org.siret && (
                    <div className="text-muted-foreground text-xs">SIRET : {org.siret}</div>
                  )}
                  {!isAE && org.vat_number && (
                    <div className="text-muted-foreground text-xs">TVA : {org.vat_number}</div>
                  )}
                  {isAE && (
                    <div className="text-amber-600 text-xs">
                      Auto-entrepreneur · TVA non applicable, art. 293 B du CGI
                    </div>
                  )}
                </>
              ) : (
                <div className="text-amber-600 text-xs">
                  Profil émetteur incomplet — complétez-le dans Paramètres → Profil de facturation.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Destinataire (client)</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Nom ou raison sociale *</Label>
                <Input value={value.third_party_name}
                  onChange={(e) => set("third_party_name", e.target.value)}
                  disabled={readOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label>Forme juridique</Label>
                <Input value={value.client_legal_form}
                  onChange={(e) => set("client_legal_form", e.target.value)}
                  disabled={readOnly} placeholder="SARL, SAS, …" />
              </div>
              <div className="grid gap-1.5">
                <Label>Email *</Label>
                <Input type="email" value={value.third_party_email}
                  onChange={(e) => set("third_party_email", e.target.value)}
                  disabled={readOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label>Référence bon de commande</Label>
                <Input value={value.client_reference}
                  onChange={(e) => set("client_reference", e.target.value)}
                  disabled={readOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label>SIRET client {type === "invoice" && <span className="text-xs text-muted-foreground">(requis fact. élec. 2026)</span>}</Label>
                <Input value={value.buyer_siret}
                  onChange={(e) => set("buyer_siret", e.target.value.replace(/\D/g, "").slice(0, 14))}
                  disabled={readOnly} placeholder="14 chiffres" />
              </div>
              <div className="grid gap-1.5">
                <Label>N° TVA intracom. client</Label>
                <Input value={value.buyer_vat_number}
                  onChange={(e) => set("buyer_vat_number", e.target.value.toUpperCase())}
                  disabled={readOnly} />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Adresse de facturation *</Label>
                <Textarea rows={2} value={value.buyer_address}
                  onChange={(e) => set("buyer_address", e.target.value)}
                  disabled={readOnly} />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Adresse de livraison (si différente)</Label>
                <Textarea rows={2} value={value.client_delivery_address}
                  onChange={(e) => set("client_delivery_address", e.target.value)}
                  disabled={readOnly} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ STEP 2 ============ */}
        <TabsContent value="s2" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Identification du document</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Objet *</Label>
                <Input value={value.title}
                  onChange={(e) => set("title", e.target.value)}
                  disabled={readOnly} placeholder="Ex : Prestation de développement — Juin 2026" />
              </div>
              <div className="grid gap-1.5">
                <Label>Numéro</Label>
                <Input value={value.document_number ?? "(attribué à l'émission)"} disabled
                  className="font-mono text-xs" />
              </div>
              <div className="grid gap-1.5">
                <Label>Type de transaction</Label>
                <Select value={value.transaction_type}
                  onValueChange={(v) => set("transaction_type", v)} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Date d'émission *</Label>
                <Input type="date" value={value.issue_date}
                  onChange={(e) => set("issue_date", e.target.value)} disabled={readOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label>Date de réalisation / livraison</Label>
                <Input type="date" value={value.service_date}
                  onChange={(e) => set("service_date", e.target.value)} disabled={readOnly} />
              </div>
              {type === "invoice" && (
                <div className="grid gap-1.5">
                  <Label>Date d'échéance *</Label>
                  <Input type="date" value={value.due_date}
                    onChange={(e) => set("due_date", e.target.value)} disabled={readOnly} />
                </div>
              )}
              {type === "quote" && (
                <div className="grid gap-1.5">
                  <Label>Validité jusqu'au</Label>
                  <Input type="date" value={value.validity_date}
                    onChange={(e) => set("validity_date", e.target.value)} disabled={readOnly} />
                </div>
              )}
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Description / notes</Label>
                <Textarea rows={2} value={value.description}
                  onChange={(e) => set("description", e.target.value)} disabled={readOnly} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Conditions de règlement</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Conditions de paiement *</Label>
                <Input value={value.payment_terms}
                  onChange={(e) => set("payment_terms", e.target.value)} disabled={readOnly} />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Coordonnées bancaires (IBAN / BIC)</Label>
                <Textarea rows={2} value={value.payment_bank_details}
                  onChange={(e) => set("payment_bank_details", e.target.value)} disabled={readOnly} />
              </div>
              {type === "invoice" && (
                <>
                  <div className="grid gap-1.5">
                    <Label>Taux de pénalités de retard (%) *</Label>
                    <Input type="number" min={0} max={100} step="any"
                      value={value.late_penalty_rate}
                      onChange={(e) => set("late_penalty_rate", e.target.value)}
                      disabled={readOnly} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Indemnité forfaitaire (€)</Label>
                    <Input type="number" min={0} step="any" value={value.recovery_indemnity}
                      onChange={(e) => set("recovery_indemnity", e.target.value)}
                      disabled={readOnly} />
                    <p className="text-xs text-muted-foreground">
                      Fixée à 40 € par l'Art. D441-5 C.com.
                    </p>
                  </div>
                  <div className="grid gap-1.5 md:col-span-2">
                    <Label>Mention d'escompte (obligatoire, même si 0 %) *</Label>
                    <Input value={value.early_discount_text}
                      onChange={(e) => set("early_discount_text", e.target.value)}
                      disabled={readOnly} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ STEP 3 ============ */}
        <TabsContent value="s3" className="space-y-4">
          {isAE && (
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-xs p-3">
              <strong>Auto-entrepreneur :</strong> TVA non applicable (art. 293 B du CGI). Tous les taux de TVA sont forcés à 0 %.
            </div>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Lignes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InvoiceLineItems
                value={value.lines}
                onChange={(lines) => set("lines", lines)}
                disabled={readOnly}
              />
              <InvoiceTotals lines={value.lines} />
            </CardContent>
          </Card>

          {type === "invoice" && (
            <Card>
              <CardHeader><CardTitle className="text-base">Acompte &amp; Net à payer</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 items-end">
                <div className="grid gap-1.5">
                  <Label>Acompte déjà versé (€)</Label>
                  <Input type="number" min={0} step="any" value={value.advance_paid}
                    onChange={(e) => set("advance_paid", e.target.value)}
                    disabled={readOnly} />
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm flex items-center justify-between">
                  <span className="font-semibold">Net à payer</span>
                  <span className="font-bold text-[color:var(--facturation)] text-lg">
                    {formatEUR(netToPay)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============ STEP 4 ============ */}
        <TabsContent value="s4" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">En-tête & pied de page</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>En-tête personnalisé</Label>
                <Textarea rows={2} value={value.header_note}
                  onChange={(e) => set("header_note", e.target.value)} disabled={readOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label>Pied de page personnalisé</Label>
                <Textarea rows={2} value={value.footer_note}
                  onChange={(e) => set("footer_note", e.target.value)} disabled={readOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label>Note interne (non imprimée)</Label>
                <Textarea rows={2} value={value.internal_note}
                  onChange={(e) => set("internal_note", e.target.value)} disabled={readOnly} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Mentions légales</CardTitle>
              <Button type="button" size="sm" variant="ghost"
                onClick={() => set("legal_mentions", buildLegalMentions(org, docSnapshot))}
                disabled={readOnly}>
                Régénérer depuis le profil
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea rows={8} className="font-mono text-xs leading-relaxed"
                value={value.legal_mentions}
                onChange={(e) => set("legal_mentions", e.target.value)}
                disabled={readOnly} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Conformité</CardTitle></CardHeader>
            <CardContent>
              <InvoiceComplianceIndicator checks={checks} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" disabled={step <= 1}
          onClick={() => setStep((s) => Math.max(1, s - 1))}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Précédent
        </Button>
        <div className="text-xs text-muted-foreground">Étape {step} / 4</div>
        {step < 4 ? (
          <Button type="button" size="sm" onClick={() => setStep((s) => Math.min(4, s + 1))}>
            Suivant <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <div>{footer}</div>
        )}
      </div>

      {step < 4 && footer && (
        <div className="flex justify-end pt-2 border-t border-border">{footer}</div>
      )}
      {/* placeholder for Switch import to keep lint quiet on unused */}
      <span className="sr-only"><Switch checked={false} onCheckedChange={() => {}} /></span>
    </div>
  );
}
