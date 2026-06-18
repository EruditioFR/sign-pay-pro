import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/confirm-action";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listPdfTemplates,
  listPdfTemplateVersions,
  restorePdfTemplateVersion,
  deletePdfTemplateVersion,
  deletePdfTemplate,
  createDocumentFromPdfTemplate,
} from "@/lib/pdf-templates.functions";
import { NewPdfTemplateDialog } from "@/components/pdf-templates/NewPdfTemplateDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Trash2, Wand2, Loader2, History, RotateCcw, CheckCircle2, FileUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/pdf-templates/")({
  component: PdfTemplatesPage,
});

function PdfTemplatesPage() {
  const { t: tr } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listPdfTemplates);
  const delFn = useServerFn(deletePdfTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["pdf-templates"],
    queryFn: () => listFn(),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Modèle supprimé");
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Modèles PDF</h1>
          <p className="text-sm text-muted-foreground">
            Réutilisez un document avec ses zones en un clic. Versions et historique conservés.
          </p>
        </div>
        <NewPdfTemplateDialog openEditorAfterImport={false} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (data?.templates ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
            <p>Aucun modèle pour l'instant. Importez un PDF pour créer votre premier modèle.</p>
            <NewPdfTemplateDialog openEditorAfterImport={false} />
          </CardContent>
        </Card>
      ) : (
        (() => {
          const NO_THEME = "__none__";
          const groups = new Map<string, NonNullable<typeof data>["templates"]>();
          for (const t of data!.templates) {
            const raw = (t as { theme?: string | null }).theme;
            const key = raw && raw.trim().length > 0 ? raw.trim() : NO_THEME;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(t);
          }
          const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
            if (a === NO_THEME) return 1;
            if (b === NO_THEME) return -1;
            return a.localeCompare(b);
          });
          return (
            <div className="space-y-6">
              {sortedKeys.map((key) => {
                const items = groups.get(key)!;
                const label = key === NO_THEME ? "Sans thématique" : key;
                return (
                  <section key={key} className="space-y-3">
                    <div className="flex items-baseline gap-2 border-b border-border pb-1">
                      <h2 className="text-lg font-semibold">{label}</h2>
                      <span className="text-xs text-muted-foreground">{items.length} modèle(s)</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {items.map((t) => (
                        <Card key={t.id}>
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <FileText className="h-4 w-4" />
                              <span className="truncate">{t.name}</span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3 text-sm">
                            {t.description && (
                              <p className="line-clamp-2 text-muted-foreground">{t.description}</p>
                            )}
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="rounded bg-muted px-2 py-0.5">
                                {tr(`documents.types.${t.document_type}`, { defaultValue: t.document_type })}
                              </span>
                              <span className="rounded bg-muted px-2 py-0.5">{t.page_count} page(s)</span>
                              <span className="rounded bg-muted px-2 py-0.5">{t.field_count} zone(s)</span>
                              <span className="rounded bg-muted px-2 py-0.5">v{t.version_count}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <UseTemplateDialog templateId={t.id} templateName={t.name} />
                              <VersionHistoryDialog templateId={t.id} templateName={t.name} />
                              <ConfirmAction
                                title="Supprimer ce modèle ?"
                                description="Toutes les versions de ce modèle seront supprimées définitivement."
                                confirmLabel="Supprimer"
                                onConfirm={() => del.mutateAsync(t.id)}
                              >
                                <Button variant="ghost" size="sm" aria-label="Supprimer le modèle">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </ConfirmAction>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        })()
      )}
    </div>
  );
}

// NewPdfTemplateDialog moved to src/components/pdf-templates/NewPdfTemplateDialog.tsx


function UseTemplateDialog({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [thirdPartyEmail, setThirdPartyEmail] = useState("");
  const navigate = useNavigate();
  const createFn = useServerFn(createDocumentFromPdfTemplate);

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          templateId,
          title: title || templateName,
          reference: reference || null,
          third_party_name: thirdPartyName || null,
          third_party_email: thirdPartyEmail || null,
        },
      }),
    onSuccess: ({ document }) => {
      toast.success("Document créé depuis le modèle");
      setOpen(false);
      navigate({ to: "/app/documents/$id/editor", params: { id: document.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Wand2 className="mr-1 h-4 w-4" /> Utiliser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau document depuis « {templateName} »</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="t-title">Titre</Label>
            <Input
              id="t-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={templateName}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-ref">Référence</Label>
            <Input id="t-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-tpn">Destinataire</Label>
            <Input id="t-tpn" value={thirdPartyName} onChange={(e) => setThirdPartyName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-tpe">Email destinataire</Label>
            <Input id="t-tpe" type="email" value={thirdPartyEmail} onChange={(e) => setThirdPartyEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Créer le document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionHistoryDialog({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const listVersionsFn = useServerFn(listPdfTemplateVersions);
  const restoreFn = useServerFn(restorePdfTemplateVersion);
  const delVersionFn = useServerFn(deletePdfTemplateVersion);

  const versionsQ = useQuery({
    queryKey: ["pdf-template-versions", templateId],
    queryFn: () => listVersionsFn({ data: { templateId } }),
    enabled: open,
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => restoreFn({ data: { versionId } }),
    onSuccess: () => {
      toast.success("Version restaurée");
      qc.invalidateQueries({ queryKey: ["pdf-template-versions", templateId] });
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delV = useMutation({
    mutationFn: (versionId: string) => delVersionFn({ data: { versionId } }),
    onSuccess: () => {
      toast.success("Version supprimée");
      qc.invalidateQueries({ queryKey: ["pdf-template-versions", templateId] });
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="mr-1 h-4 w-4" /> Historique
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Historique de « {templateName} »</DialogTitle>
        </DialogHeader>
        {versionsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (versionsQ.data?.versions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune version.</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-auto rounded-md border border-border">
            {versionsQ.data!.versions.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    Version {v.version}
                    {v.is_current && (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()} · {v.page_count} page(s) · {v.field_count} zone(s)
                  </div>
                  {v.notes && <div className="mt-1 text-xs text-muted-foreground">« {v.notes} »</div>}
                </div>
                <div className="flex items-center gap-1">
                  {!v.is_current && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restore.mutate(v.id)}
                        disabled={restore.isPending}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurer
                      </Button>
                      <ConfirmAction
                        title={`Supprimer la version ${v.version} ?`}
                        description="Cette version sera supprimée définitivement et ne pourra plus être restaurée."
                        confirmLabel="Supprimer"
                        onConfirm={() => delV.mutateAsync(v.id)}
                      >
                        <Button size="sm" variant="ghost" aria-label="Supprimer la version">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </ConfirmAction>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function _ensureLinkImport() {
  return Link;
}
