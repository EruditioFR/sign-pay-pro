import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  getMyBillingProfile, updateBillingProfile,
} from "@/lib/organization.functions";
import { checkSellerCompliance, buildLegalMentions } from "@/lib/invoice-compliance";
import { InvoiceComplianceIndicator } from "@/components/facturation/InvoiceComplianceIndicator";

export const Route = createFileRoute("/_authenticated/app/settings/billing-profile")({
  component: BillingProfilePage,
});

type Form = {
  name: string;
  legal_form: string;
  share_capital: string;
  siret: string;
  rcs_city: string;
  rm_number: string;
  naf_code: string;
  vat_number: string;
  vat_regime: "debits" | "encaissements";
  is_autoentrepreneur: boolean;
  iban: string;
  bic: string;
  late_penalty_rate: string;
  recovery_indemnity: string;
  default_payment_terms: string;
  default_early_discount: string;
};

const empty: Form = {
  name: "", legal_form: "", share_capital: "", siret: "", rcs_city: "",
  rm_number: "", naf_code: "", vat_number: "", vat_regime: "debits",
  is_autoentrepreneur: false, iban: "", bic: "", late_penalty_rate: "12",
  recovery_indemnity: "40",
  default_payment_terms: "Paiement à 30 jours fin de mois",
  default_early_discount: "Pas d'escompte pour paiement anticipé",
};

const LEGAL_FORMS = ["SARL", "SAS", "SASU", "EURL", "SA", "SCI", "AE", "EI", "EIRL", "Autre"];

function BillingProfilePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyBillingProfile);
  const updateFn = useServerFn(updateBillingProfile);

  const q = useQuery({
    queryKey: ["billing-profile"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<Form>(empty);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!q.data || hydrated) return;
    const d = q.data as Record<string, unknown>;
    setForm({
      name: String(d.name ?? ""),
      legal_form: String(d.legal_form ?? ""),
      share_capital: d.share_capital != null ? String(d.share_capital) : "",
      siret: String(d.siret ?? ""),
      rcs_city: String(d.rcs_city ?? ""),
      rm_number: String(d.rm_number ?? ""),
      naf_code: String(d.naf_code ?? ""),
      vat_number: String(d.vat_number ?? ""),
      vat_regime: (d.vat_regime as "debits" | "encaissements") ?? "debits",
      is_autoentrepreneur: Boolean(d.is_autoentrepreneur),
      iban: String(d.iban ?? ""),
      bic: String(d.bic ?? ""),
      late_penalty_rate: d.late_penalty_rate != null ? String(d.late_penalty_rate) : "12",
      recovery_indemnity: d.recovery_indemnity != null ? String(d.recovery_indemnity) : "40",
      default_payment_terms: String(d.default_payment_terms ?? "Paiement à 30 jours fin de mois"),
      default_early_discount: String(d.default_early_discount ?? "Pas d'escompte pour paiement anticipé"),
    });
    setHydrated(true);
  }, [q.data, hydrated]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim() || undefined,
        legal_form: form.is_autoentrepreneur ? null : form.legal_form || null,
        share_capital: form.is_autoentrepreneur
          ? null
          : form.share_capital ? Number(form.share_capital) : null,
        siret: form.siret.replace(/\s+/g, "") || null,
        rcs_city: form.is_autoentrepreneur ? null : form.rcs_city || null,
        rm_number: form.rm_number || null,
        naf_code: form.naf_code || null,
        vat_number: form.is_autoentrepreneur
          ? null
          : form.vat_number.replace(/\s+/g, "").toUpperCase() || null,
        vat_regime: form.is_autoentrepreneur ? null : form.vat_regime,
        is_autoentrepreneur: form.is_autoentrepreneur,
        iban: form.iban.replace(/\s+/g, "").toUpperCase() || null,
        bic: form.bic.replace(/\s+/g, "").toUpperCase() || null,
        late_penalty_rate: form.late_penalty_rate ? Number(form.late_penalty_rate) : null,
        recovery_indemnity: form.recovery_indemnity ? Number(form.recovery_indemnity) : null,
        default_payment_terms: form.default_payment_terms || null,
        default_early_discount: form.default_early_discount || null,
      };
      await updateFn({ data: payload as never });
    },
    onSuccess: () => {
      toast.success("Profil de facturation enregistré.");
      qc.invalidateQueries({ queryKey: ["billing-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orgProfile = {
    name: form.name,
    legal_form: form.legal_form,
    share_capital: form.share_capital ? Number(form.share_capital) : null,
    siret: form.siret,
    rcs_city: form.rcs_city,
    rm_number: form.rm_number,
    naf_code: form.naf_code,
    vat_number: form.vat_number,
    is_autoentrepreneur: form.is_autoentrepreneur,
    iban: form.iban,
    late_penalty_rate: Number(form.late_penalty_rate) || 0,
  };
  const checks = checkSellerCompliance(orgProfile);
  const legalPreview = buildLegalMentions(orgProfile, { type: "invoice" });

  const isAE = form.is_autoentrepreneur;

  return (
    <div className="max-w-4xl space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[color:var(--facturation)]" />
            Profil de facturation
          </h1>
          <p className="text-sm text-muted-foreground">
            Mentions obligatoires (Art. L441-9 C.com) pré-remplies sur tous vos devis et factures.
          </p>
        </div>
        <InvoiceComplianceIndicator checks={checks} />
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Identité</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Dénomination sociale / Nom commercial *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 md:col-span-2">
            <Switch
              checked={form.is_autoentrepreneur}
              onCheckedChange={(v) => set("is_autoentrepreneur", v)}
            />
            <span className="text-sm">
              Je suis auto-entrepreneur / micro-entreprise (masque TVA, capital et RCS)
            </span>
          </label>
          {!isAE && (
            <>
              <div className="grid gap-1.5">
                <Label>Forme juridique *</Label>
                <Select value={form.legal_form} onValueChange={(v) => set("legal_form", v)}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {LEGAL_FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Capital social (€) *</Label>
                <Input
                  type="number" min={0} step="any"
                  value={form.share_capital}
                  onChange={(e) => set("share_capital", e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Identifiants légaux</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>SIRET (14 chiffres) *</Label>
            <Input
              value={form.siret}
              onChange={(e) => set("siret", e.target.value.replace(/\D/g, "").slice(0, 14))}
              placeholder="12345678901234"
            />
          </div>
          {!isAE && (
            <div className="grid gap-1.5">
              <Label>Ville d'immatriculation RCS *</Label>
              <Input value={form.rcs_city} onChange={(e) => set("rcs_city", e.target.value)} placeholder="Paris" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>N° RM (artisans)</Label>
            <Input value={form.rm_number} onChange={(e) => set("rm_number", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Code APE/NAF</Label>
            <Input value={form.naf_code} onChange={(e) => set("naf_code", e.target.value)} placeholder="6201Z" />
          </div>
        </CardContent>
      </Card>

      {!isAE && (
        <Card>
          <CardHeader><CardTitle className="text-base">TVA</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>N° TVA intracommunautaire *</Label>
              <Input
                value={form.vat_number}
                onChange={(e) => set("vat_number", e.target.value.toUpperCase())}
                placeholder="FR12345678901"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Régime de TVA</Label>
              <Select value={form.vat_regime} onValueChange={(v: "debits" | "encaissements") => set("vat_regime", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debits">Débits</SelectItem>
                  <SelectItem value="encaissements">Encaissements</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Coordonnées bancaires</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5 md:col-span-2">
            <Label>IBAN</Label>
            <Input
              value={form.iban}
              onChange={(e) => set("iban", e.target.value.toUpperCase())}
              placeholder="FR76 1234 5678 9012 3456 7890 123"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>BIC</Label>
            <Input
              value={form.bic}
              onChange={(e) => set("bic", e.target.value.toUpperCase())}
              placeholder="BNPAFRPPXXX"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Conditions de paiement par défaut</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Taux de pénalités de retard (%) *</Label>
            <Input
              type="number" min={0} max={100} step="any"
              value={form.late_penalty_rate}
              onChange={(e) => set("late_penalty_rate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Défaut légal 2026 : ~12 % (3× taux d'intérêt légal).
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Indemnité forfaitaire de recouvrement (€)</Label>
            <Input
              type="number" min={0} step="any"
              value={form.recovery_indemnity}
              onChange={(e) => set("recovery_indemnity", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Fixée à 40 € par l'Art. D441-5 du Code de commerce.
            </p>
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Conditions de paiement (texte)</Label>
            <Textarea
              rows={2}
              value={form.default_payment_terms}
              onChange={(e) => set("default_payment_terms", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Mention d'escompte (obligatoire, même si 0 %)</Label>
            <Input
              value={form.default_early_discount}
              onChange={(e) => set("default_early_discount", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Aperçu des mentions légales</CardTitle></CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-xs bg-muted/50 rounded-md p-3 leading-relaxed">
            {legalPreview || "(complétez les champs ci-dessus pour générer les mentions)"}
          </pre>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !form.name.trim()}
          className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
        >
          <Save className="mr-1 h-4 w-4" />
          {save.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
