import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getGuestDashboard,
  cancelGuestSignerRequest,
} from "@/lib/guest.functions";
import { Button } from "@/components/ui/button";
import { DocumentStatusBadge, SignerStatusBadge, StepStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";
import { Ban } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/guest/$token")({
  head: () => ({
    meta: [{ title: "Mon espace invité" }],
  }),
  component: GuestDashboard,
});

function GuestDashboard() {
  const { token } = useParams({ from: "/guest/$token" });
  const fetchFn = useServerFn(getGuestDashboard);
  const cancelFn = useServerFn(cancelGuestSignerRequest);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["guest-dashboard", token],
    queryFn: () => fetchFn({ data: { token } }),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { token, request_id: id } }),
    onSuccess: () => {
      toast.success("Invitation annulée");
      qc.invalidateQueries({ queryKey: ["guest-dashboard", token] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-3xl px-6 py-12">Chargement…</div>;
  }
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Lien invalide</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error as Error).message}
        </p>
        <Button asChild className="mt-4">
          <Link to="/guest">Renvoyer un lien</Link>
        </Button>
      </div>
    );
  }

  const documents = data?.documents ?? [];
  const signers = data?.signers ?? [];
  const workflowSteps = data?.workflowSteps ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mon espace invité</h1>
          <p className="text-sm text-muted-foreground">{data?.session.email}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/guest/new">Nouveau circuit</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Créer un compte</Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
        Vos circuits ne sont accessibles qu'avec ce lien. Créez un compte avec
        l'email <strong>{data?.session.email}</strong> pour les retrouver
        automatiquement et y accéder depuis n'importe quel appareil.
      </div>

      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Aucun circuit pour le moment.
        </div>
      ) : (
        <ul className="space-y-3">
          {documents.map((d) => {
            const docSigners = signers.filter((s) => s.document_id === d.id);
            const docSteps = workflowSteps
              .filter((s) => s.document_id === d.id)
              .sort((a, b) => a.position - b.position);
            return (
              <li
                key={d.id}
                className="rounded-md border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Créé le {new Date(d.created_at).toLocaleDateString("fr-FR")}
                      {d.amount_ttc != null && (
                        <> · {Number(d.amount_ttc).toFixed(2)} €</>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline">{d.status}</Badge>
                </div>

                {docSigners.length > 0 && (
                  <ul className="mt-3 divide-y divide-border rounded border border-border/60 text-sm">
                    {docSigners
                      .sort((a, b) => a.order_index - b.order_index)
                      .map((s, idx) => (
                        <li
                          key={`${s.document_id}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate">
                              {s.signer_name}{" "}
                              <span className="text-muted-foreground">
                                · {s.signer_email}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                s.status === "signed"
                                  ? "default"
                                  : s.status === "pending"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {s.status}
                            </Badge>
                            {s.status === "pending" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Annuler"
                                onClick={() => {
                                  // request_id not exposed by API; we need to refetch with id
                                  // Simplified: not allow cancel here without id
                                  toast.info(
                                    "Pour annuler cette invitation, créez un compte ou contactez-nous."
                                  );
                                  void cancelM;
                                }}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}

                {docSteps.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Circuit de validation
                    </div>
                    <ul className="divide-y divide-border rounded border border-border/60 text-sm">
                      {docSteps.map((st, idx) => (
                        <li
                          key={`step-${d.id}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate">
                              <span className="text-muted-foreground">
                                {st.position}.
                              </span>{" "}
                              {st.approver_name}{" "}
                              <span className="text-muted-foreground">
                                · {st.approver_email}
                              </span>
                            </div>
                            {st.comment && (
                              <div className="truncate text-xs italic text-muted-foreground">
                                « {st.comment} »
                              </div>
                            )}
                          </div>
                          <Badge
                            variant={
                              st.status === "approved"
                                ? "default"
                                : st.status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {st.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
