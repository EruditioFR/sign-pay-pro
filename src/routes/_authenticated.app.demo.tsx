import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, ExternalLink, RefreshCw, Sparkles, Trash2, FileSignature, Home, Mail } from "lucide-react";
import {
  listDemoScenarios,
  seedDemoScenarios,
  resetDemoScenarios,
} from "@/lib/demo.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/app/demo")({
  component: DemoPage,
});

function DemoPage() {
  const { session, loading: authLoading } = useAuth();
  const fetchScenarios = useServerFn(listDemoScenarios);
  const seed = useServerFn(seedDemoScenarios);
  const reset = useServerFn(resetDemoScenarios);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["demo-scenarios"],
    queryFn: () => fetchScenarios(),
    enabled: !authLoading && !!session,
  });

  const seedMut = useMutation({
    mutationFn: () => seed({}),
    onSuccess: () => {
      toast.success("Scénarios de démo prêts");
      qc.invalidateQueries({ queryKey: ["demo-scenarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => reset({}),
    onSuccess: () => {
      toast.success("Démo réinitialisée");
      qc.invalidateQueries({ queryKey: ["demo-scenarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scenarios = data?.scenarios ?? [];
  const allReady = scenarios.length > 0 && scenarios.every((s) => s.document_id);

  return (
    <div className="space-y-6">
      <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Mode démonstration
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Deux scénarios prêts à présenter : signature d'un bon de commande
                prestataire et d'un bon de visite immobilier. Cliquez sur «&nbsp;Générer&nbsp;»
                pour créer les documents avec PDF réalistes et liens de signature
                déjà actifs pour <span className="font-medium">jbbejot@gmail.com</span>.
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                onClick={() => seedMut.mutate()}
                disabled={seedMut.isPending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${seedMut.isPending ? "animate-spin" : ""}`} />
                {allReady ? "Régénérer" : "Générer la démo"}
              </Button>
              {allReady && (
                <Button
                  variant="outline"
                  onClick={() => resetMut.mutate()}
                  disabled={resetMut.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Effacer
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((s) => (
            <ScenarioCard
              key={s.scenario}
              scenario={s.scenario}
              title={s.title}
              reference={s.reference}
              documentId={s.document_id}
              token={s.signature_token}
              signerEmail={s.signer_email}
              status={s.status}
              onCreate={() => seedMut.mutate()}
              creating={seedMut.isPending}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conseils pour la démo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Cliquez «&nbsp;Générer la démo&nbsp;» pour créer les deux scénarios en un clic.</p>
          <p>2. Pour chaque scénario, ouvrez le document côté émetteur (parcours interne), puis copiez le lien de signature et ouvrez-le dans un onglet privé pour montrer le parcours signataire.</p>
          <p>3. Après signature, revenez dans «&nbsp;Documents&nbsp;» pour montrer le statut mis à jour et le PDF signé.</p>
          <p>4. Vous pouvez régénérer à tout moment pour repartir d'un état propre.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioCard({
  scenario,
  title,
  reference,
  documentId,
  token,
  signerEmail,
  status,
  onCreate,
  creating,
}: {
  scenario: string;
  title: string;
  reference: string;
  documentId: string;
  token: string;
  signerEmail: string;
  status: string;
  onCreate: () => void;
  creating: boolean;
}) {
  const signUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${token}` : "";
  const icon = scenario === "purchase_order" ? <FileSignature className="h-5 w-5 text-primary" /> : <Home className="h-5 w-5 text-emerald-600" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">{icon}</div>
          <div className="flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span>Réf. {reference}</span>
              <StatusBadge status={status} />
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!documentId ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            <p className="mb-3">Pas encore créé.</p>
            <Button size="sm" onClick={onCreate} disabled={creating}>
              Créer ce scénario
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              Signataire : <span className="font-medium text-foreground">{signerEmail}</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Lien de signature public</label>
              <div className="flex gap-1">
                <Input readOnly value={signUrl} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(signUrl);
                    toast.success("Lien copié");
                  }}
                  title="Copier"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(signUrl, "_blank")}
                  title="Ouvrir"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button asChild variant="secondary" size="sm" className="flex-1">
                <Link to="/app/documents/$id" params={{ id: documentId }}>
                  Voir côté émetteur
                </Link>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <a href={signUrl} target="_blank" rel="noreferrer">
                  Parcours signataire
                </a>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "signed") return <Badge className="bg-emerald-500/15 text-emerald-700">Signé</Badge>;
  if (status === "pending") return <Badge variant="secondary">En attente de signature</Badge>;
  if (status === "declined") return <Badge variant="destructive">Refusé</Badge>;
  if (status === "not_created") return <Badge variant="outline">À générer</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
