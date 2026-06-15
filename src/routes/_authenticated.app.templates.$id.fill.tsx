import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, Wand2 } from "lucide-react";
import {
  getOverlayTemplate,
  instantiateOverlayTemplate,
  renderOverlayPdf,
} from "@/lib/document-overlay.functions";
import {
  OverlayZonesSchema,
  ZONE_COLORS,
  type OverlayZone,
} from "@/lib/template-overlay/schema";
import { SourceCanvas } from "@/components/overlay-editor/SourceCanvas";

export const Route = createFileRoute("/_authenticated/app/templates/$id/fill")({
  component: FillOverlayPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Introuvable.</div>,
});

function FillOverlayPage() {
  const { id } = useParams({ from: "/_authenticated/app/templates/$id/fill" });
  const get = useServerFn(getOverlayTemplate);
  const inst = useServerFn(instantiateOverlayTemplate);
  const render = useServerFn(renderOverlayPdf);

  const q = useQuery({
    queryKey: ["overlay-template", id],
    queryFn: () => get({ data: { id } }),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [outUrl, setOutUrl] = useState<string | null>(null);

  const zones: OverlayZone[] = useMemo(() => {
    const raw = (q.data?.template as { overlay_zones?: unknown } | undefined)?.overlay_zones ?? [];
    return OverlayZonesSchema.safeParse(raw).data ?? [];
  }, [q.data]);

  const instMut = useMutation({
    mutationFn: () => inst({ data: { id, values } }),
    onSuccess: (r) => {
      // pre-fill auto-resolved values
      setValues((prev) => ({ ...r.values, ...prev }));
      toast.success("Document brouillon créé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderMut = useMutation({
    mutationFn: () => render({ data: { id, values } }),
    onSuccess: (r) => {
      setOutUrl(r.signedUrl ?? null);
      toast.success("PDF généré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!q.data?.signedUrl) return <div className="p-6 text-sm">Fichier source indisponible.</div>;

  const tpl = q.data.template as { name?: string; source_mime?: string };

  return (
    <div className="min-h-screen">
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/templates"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Link>
        </Button>
        <h1 className="text-base font-semibold truncate">{tpl.name ?? "Modèle"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 p-4">
        {/* Document preview with zones overlay */}
        <Card className="overflow-auto bg-muted/40 p-4">
          <SourceCanvas
            url={q.data.signedUrl}
            mime={tpl.source_mime ?? "application/pdf"}
            maxWidth={820}
            onPagesRendered={() => {}}
            renderOverlay={(p) => (
              <div className="absolute inset-0">
                {zones
                  .filter((z) => z.page === p.index)
                  .map((z) => {
                    const c = ZONE_COLORS[z.type];
                    const val = values[z.id] ?? "";
                    return (
                      <div
                        key={z.id}
                        className="absolute flex items-center px-1 text-[11px]"
                        style={{
                          left: z.x * p.width,
                          top: z.y * p.height,
                          width: z.width * p.width,
                          height: z.height * p.height,
                          border: `1px solid ${c.stroke}`,
                          background: val ? "rgba(255,255,255,0.9)" : c.fill,
                          color: "#111",
                          overflow: "hidden",
                        }}
                        title={z.name}
                      >
                        {val || <span className="text-muted-foreground">{c.label}</span>}
                      </div>
                    );
                  })}
              </div>
            )}
          />
        </Card>

        {/* Field form */}
        <div className="space-y-3">
          <Card className="p-3 space-y-3">
            <div className="font-medium text-sm">Compléter les champs</div>
            {zones.length === 0 && (
              <div className="text-xs text-muted-foreground">Ce modèle n'a aucune zone.</div>
            )}
            <div className="space-y-3 max-h-[55vh] overflow-auto">
              {zones.map((z) => {
                const c = ZONE_COLORS[z.type];
                return (
                  <div key={z.id} className="space-y-1">
                    <Label className="flex items-center gap-2 text-xs">
                      <Badge style={{ background: c.stroke, color: "white" }}>{c.label}</Badge>
                      <span className="truncate">{z.name || "—"}</span>
                      {z.required && <span className="text-destructive">*</span>}
                    </Label>
                    {z.type === "checkbox" ? (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={values[z.id] === "true"}
                          onCheckedChange={(v) =>
                            setValues((p) => ({ ...p, [z.id]: v ? "true" : "false" }))
                          }
                        />
                        <span className="text-xs text-muted-foreground">Coché si activé</span>
                      </div>
                    ) : (
                      <Input
                        value={values[z.id] ?? ""}
                        onChange={(e) =>
                          setValues((p) => ({ ...p, [z.id]: e.target.value }))
                        }
                        placeholder={
                          z.type === "date"
                            ? "AAAA-MM-JJ"
                            : z.type === "signature" || z.type === "initials"
                              ? "Nom du signataire"
                              : "Valeur"
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-3 space-y-2">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => instMut.mutate()}
              disabled={instMut.isPending}
            >
              <Wand2 className="h-4 w-4 mr-1.5" />
              Créer le brouillon
            </Button>
            <Button
              className="w-full"
              onClick={() => renderMut.mutate()}
              disabled={renderMut.isPending}
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              {renderMut.isPending ? "Génération…" : "Générer le PDF final"}
            </Button>
            {outUrl && (
              <a
                href={outUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-primary underline text-center"
              >
                Télécharger le PDF généré
              </a>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
