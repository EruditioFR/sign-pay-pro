import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createDocument, type DocumentType } from "@/lib/documents.functions";
import { listPdfTemplates } from "@/lib/pdf-templates.functions";
import { createSignatureRequests } from "@/lib/signature-requests.functions";
import { createDocumentPaymentLink } from "@/lib/stripe-payment-links.functions";
import { NewPdfTemplateDialog } from "@/components/pdf-templates/NewPdfTemplateDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles, FileUp, LayoutTemplate, PencilLine, FileText, ArrowRight, ChevronDown, ChevronUp,
  Plus, Trash2, Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/documents/new")({
  component: NewDocumentPage,
});

const TYPE_ORDER = ["quote", "invoice", "purchase_order", "contract", "other"] as const;

function NewDocumentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showManual, setShowManual] = useState(false);

  const listFn = useServerFn(listPdfTemplates);
  const tplQ = useQuery({
    queryKey: ["pdf-templates"],
    queryFn: () => listFn(),
  });

  const templates = tplQ.data?.templates ?? [];
  const groups = new Map<string, typeof templates>();
  for (const tpl of templates) {
    const key = tpl.document_type || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tpl);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a as never);
    const ib = TYPE_ORDER.indexOf(b as never);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("documents.new")}</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez comment démarrer votre document.
        </p>
      </header>

      {/* 3 main actions inspired by Signova execution actions */}
      <section className="grid gap-3 md:grid-cols-3">
        <Link to="/app/templates" className="block">
          <StartOptionCard
            icon={<LayoutTemplate className="h-5 w-5" />}
            title="Partir d'un modèle"
            description="Sélectionnez un modèle : un duplicata est créé comme nouveau document."
            accent
            cta="Voir les modèles"
          />
        </Link>
        <NewPdfTemplateDialog
          trigger={
            <button type="button" className="text-left">
              <StartOptionCard
                icon={<FileUp className="h-5 w-5" />}
                title="Importer un PDF / CERFA"
                description="Uploadez votre formulaire puis placez les zones à saisir & signer."
                cta="Importer un fichier"
              />
            </button>
          }
        />
        <Link to="/app/documents/wysiwyg" className="block">
          <StartOptionCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Créer depuis l'éditeur"
            description="Démarrez d'une page blanche avec l'éditeur WYSIWYG."
            cta="Ouvrir l'éditeur"
          />
        </Link>
      </section>

      {/* Inline picker of existing templates */}
      <section id="template-picker" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Modèles disponibles</h2>
            <p className="text-xs text-muted-foreground">
              Cliquez sur un modèle pour créer un document à partir de celui-ci.
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/pdf-templates">Gérer les modèles <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>

        {tplQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
              <p>Aucun modèle pour l'instant. Importez votre premier PDF pour démarrer.</p>
              <NewPdfTemplateDialog />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {sortedKeys.map((key) => {
              const items = groups.get(key)!;
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-baseline gap-2 border-b border-border pb-1">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`documents.types.${key}`, { defaultValue: key })}
                    </h3>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((tpl) => (
                      <Link
                        key={tpl.id}
                        to="/app/pdf-templates"
                        className="group block rounded-lg border border-border bg-card p-3 transition hover:border-primary hover:shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{tpl.name}</div>
                            {tpl.description && (
                              <div className="line-clamp-2 text-xs text-muted-foreground">{tpl.description}</div>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                              <span className="rounded bg-muted px-1.5 py-0.5">{tpl.page_count} p.</span>
                              <span className="rounded bg-muted px-1.5 py-0.5">{tpl.field_count} zones</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Manual entry (collapsed by default) */}
      <section className="space-y-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowManual((s) => !s)}
          className="gap-2"
        >
          <PencilLine className="h-4 w-4" />
          Saisie manuelle (sans modèle)
          {showManual ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {showManual && <ManualDocumentForm />}
      </section>
    </div>
  );
}

function StartOptionCard({
  icon, title, description, cta, accent, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <Card
      className={`h-full transition hover:border-primary hover:shadow-sm ${
        accent ? "bg-foreground text-background border-foreground" : ""
      }`}
    >
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-md ${
            accent ? "bg-background/10 text-background" : "bg-foreground text-background"
          }`}
        >
          {icon}
        </div>
        <div className="space-y-1">
          <div className="text-base font-semibold">{title}</div>
          <p className={`text-xs ${accent ? "text-background/70" : "text-muted-foreground"}`}>
            {description}
          </p>
        </div>
        <div className={`mt-auto inline-flex items-center gap-1 text-xs font-medium ${
          accent ? "text-background" : "text-primary"
        }`}>
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </CardContent>
    </Card>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {inner}
      </button>
    );
  }
  return inner;
}

type Signer = { signer_name: string; signer_email: string };

function ManualDocumentForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useServerFn(createDocument);
  const createSigs = useServerFn(createSignatureRequests);
  const createPayLink = useServerFn(createDocumentPaymentLink);
  const [busy, setBusy] = useState(false);

  // Signers
  const [signers, setSigners] = useState<Signer[]>([{ signer_name: "", signer_email: "" }]);
  const [sequential] = useState(true); // ordre séquentiel fixe (choix utilisateur)
  const [expiresIn, setExpiresIn] = useState(30);

  // Payment
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");

  const updateSigner = (i: number, patch: Partial<Signer>) =>
    setSigners((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addSigner = () => setSigners((s) => [...s, { signer_name: "", signer_email: "" }]);
  const removeSigner = (i: number) => setSigners((s) => s.filter((_, idx) => idx !== i));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("documents.new")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const currency = (fd.get("currency") as string) || "EUR";
            const title = String(fd.get("title") ?? "");
            const validSigners = signers.filter((s) => s.signer_name.trim() && s.signer_email.trim());
            const payAmount = paymentEnabled ? Number(paymentAmount) : 0;
            if (paymentEnabled && (!payAmount || payAmount <= 0)) {
              toast.error("Indiquez un montant de paiement valide.");
              return;
            }
            setBusy(true);
            try {
              const res = await create({
                data: {
                  type: (fd.get("type") as DocumentType) ?? "other",
                  title,
                  reference: (fd.get("reference") as string) || null,
                  description: (fd.get("description") as string) || null,
                  amount_ht: fd.get("amount_ht") ? Number(fd.get("amount_ht")) : null,
                  amount_ttc: fd.get("amount_ttc") ? Number(fd.get("amount_ttc")) : null,
                  currency,
                  third_party_name: (fd.get("third_party_name") as string) || null,
                  third_party_email: (fd.get("third_party_email") as string) || null,
                  issue_date: (fd.get("issue_date") as string) || null,
                  due_date: (fd.get("due_date") as string) || null,
                  tags: [],
                },
              });
              const docId = res.document.id;

              // 1) Paiement Stripe (avant les emails pour pouvoir joindre le lien)
              if (paymentEnabled) {
                try {
                  await createPayLink({
                    data: {
                      document_id: docId,
                      amount: payAmount,
                      currency,
                      label: title || "Document",
                    },
                  });
                  toast.success("Lien de paiement Stripe généré.");
                } catch (err) {
                  toast.error(
                    "Lien Stripe non créé : " +
                      (err instanceof Error ? err.message : "erreur inconnue"),
                  );
                }
              }

              // 2) Demandes de signature (emails inclus le lien de paiement le cas échéant)
              if (validSigners.length > 0) {
                try {
                  await createSigs({
                    data: {
                      document_id: docId,
                      sequential,
                      expires_in_days: expiresIn,
                      signers: validSigners.map((s, idx) => ({
                        signer_name: s.signer_name.trim(),
                        signer_email: s.signer_email.trim(),
                        order_index: idx + 1,
                      })),
                    },
                  });
                  toast.success(
                    `Invitation${validSigners.length > 1 ? "s" : ""} envoyée${validSigners.length > 1 ? "s" : ""}.`,
                  );
                } catch (err) {
                  toast.error(
                    "Signature : " + (err instanceof Error ? err.message : "erreur inconnue"),
                  );
                }
              }

              toast.success(t("documents.created"));
              navigate({ to: "/app/documents/$id", params: { id: docId } });
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : t("common.error"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="md:col-span-2 grid gap-2">
            <Label htmlFor="title">{t("documents.field.title")}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">{t("documents.field.type")}</Label>
            <Select name="type" defaultValue="quote">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["purchase_order", "quote", "invoice", "contract", "other"] as DocumentType[]).map((tp) => (
                  <SelectItem key={tp} value={tp}>{t(`documents.types.${tp}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reference">{t("documents.field.reference")}</Label>
            <Input id="reference" name="reference" maxLength={100} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="third_party_name">{t("documents.field.third_party")}</Label>
            <Input id="third_party_name" name="third_party_name" maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="third_party_email">{t("documents.field.third_party_email")}</Label>
            <Input id="third_party_email" name="third_party_email" type="email" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount_ht">{t("documents.field.amount_ht")}</Label>
            <Input id="amount_ht" name="amount_ht" type="number" step="0.01" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount_ttc">{t("documents.field.amount_ttc")}</Label>
            <Input id="amount_ttc" name="amount_ttc" type="number" step="0.01" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="currency">{t("documents.field.currency")}</Label>
            <Input id="currency" name="currency" defaultValue="EUR" maxLength={3} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue_date">{t("documents.field.issue_date")}</Label>
            <Input id="issue_date" name="issue_date" type="date" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="due_date">{t("documents.field.due_date")}</Label>
            <Input id="due_date" name="due_date" type="date" />
          </div>
          <div className="md:col-span-2 grid gap-2">
            <Label htmlFor="description">{t("documents.field.description")}</Label>
            <Textarea id="description" name="description" rows={4} maxLength={2000} />
          </div>

          {/* ====== Signataires ====== */}
          <div className="md:col-span-2 rounded-md border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Destinataires pour signature</h3>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addSigner} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ordre séquentiel : chaque signataire reçoit son email après la signature du précédent.
              Laissez vide si vous n'envoyez pas de demande de signature maintenant.
            </p>
            <div className="space-y-2">
              {signers.map((s, i) => (
                <div key={i} className="grid grid-cols-[24px_1fr_1fr_auto] items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{i + 1}.</span>
                  <Input
                    placeholder="Nom"
                    value={s.signer_name}
                    onChange={(e) => updateSigner(i, { signer_name: e.target.value })}
                  />
                  <Input
                    type="email"
                    placeholder="email@exemple.fr"
                    value={s.signer_email}
                    onChange={(e) => updateSigner(i, { signer_email: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSigner(i)}
                    disabled={signers.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="expires" className="text-xs">Valide pendant (jours)</Label>
              <Input
                id="expires"
                type="number"
                min={1}
                max={365}
                value={expiresIn}
                onChange={(e) => setExpiresIn(Number(e.target.value) || 30)}
                className="w-24 h-8"
              />
            </div>
          </div>

          {/* ====== Paiement ====== */}
          <div className="md:col-span-2 rounded-md border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="payment-toggle" className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm font-semibold">Demander un paiement</span>
                <span className="text-xs text-muted-foreground font-normal">
                  (Stripe — lien joint à l'email de signature)
                </span>
              </Label>
              <Switch
                id="payment-toggle"
                checked={paymentEnabled}
                onCheckedChange={setPaymentEnabled}
              />
            </div>
            {paymentEnabled && (
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <div className="grid gap-1">
                  <Label htmlFor="pay-amount" className="text-xs">Montant à payer</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    step="0.01"
                    min="0.5"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    required={paymentEnabled}
                  />
                </div>
                <p className="self-end text-xs text-muted-foreground pb-2">
                  Devise = devise du document.
                </p>
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/documents" })}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
