import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createDocument, type DocumentType } from "@/lib/documents.functions";
import { listPdfTemplates } from "@/lib/pdf-templates.functions";
import { NewPdfTemplateDialog } from "@/components/pdf-templates/NewPdfTemplateDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles, FileUp, LayoutTemplate, PencilLine, FileText, ArrowRight, ChevronDown, ChevronUp,
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
        <Link to="/admin/business-verticals" className="block">
          <StartOptionCard
            icon={<LayoutTemplate className="h-5 w-5" />}
            title="Partir d'un modèle"
            description="Parcourez la bibliothèque des modèles par secteur métier."
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
                description="Uploadez votre formulaire et posez des champs dynamiques + signature."
                cta="Importer un fichier"
              />
            </button>
          }
          onCreated={(id) => navigate({ to: "/app/pdf-templates" })}
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

function ManualDocumentForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useServerFn(createDocument);
  const [busy, setBusy] = useState(false);

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
            setBusy(true);
            try {
              const res = await create({
                data: {
                  type: (fd.get("type") as DocumentType) ?? "other",
                  title: String(fd.get("title") ?? ""),
                  reference: (fd.get("reference") as string) || null,
                  description: (fd.get("description") as string) || null,
                  amount_ht: fd.get("amount_ht") ? Number(fd.get("amount_ht")) : null,
                  amount_ttc: fd.get("amount_ttc") ? Number(fd.get("amount_ttc")) : null,
                  currency: (fd.get("currency") as string) || "EUR",
                  third_party_name: (fd.get("third_party_name") as string) || null,
                  third_party_email: (fd.get("third_party_email") as string) || null,
                  issue_date: (fd.get("issue_date") as string) || null,
                  due_date: (fd.get("due_date") as string) || null,
                  tags: [],
                },
              });
              toast.success(t("documents.created"));
              navigate({ to: "/app/documents/$id", params: { id: res.document.id } });
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
