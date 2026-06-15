import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  decideGuestApprovalStep,
  getGuestApprovalStep,
} from "@/lib/guest-approvals.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StepStatusBadge } from "@/components/status-badge";
import { toast } from "sonner";

export const Route = createFileRoute("/approve/$token")({
  head: () => ({ meta: [{ title: "Validation d'un document" }] }),
  component: ApprovePage,
});

function ApprovePage() {
  const { token } = useParams({ from: "/approve/$token" });
  const fetchFn = useServerFn(getGuestApprovalStep);
  const decideFn = useServerFn(decideGuestApprovalStep);
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["guest-approval", token],
    queryFn: () => fetchFn({ data: { token } }),
  });

  const m = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decideFn({ data: { token, decision, comment: comment || undefined } }),
    onSuccess: (r) => {
      toast.success(
        r.status === "approved" ? "Étape approuvée." : "Étape rejetée."
      );
      qc.invalidateQueries({ queryKey: ["guest-approval", token] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-2xl px-6 py-12">Chargement…</div>;
  }
  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Lien invalide</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error as Error).message}
        </p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const step = data!.step as any;
  const doc = step.document_workflows?.documents;
  const isPending = step.status === "pending";

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Validation requise</h1>
        <StepStatusBadge status={step.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        Étape {step.position} — {step.name}
      </p>

      {doc && (
        <div className="mt-6 rounded-md border border-border bg-card p-4">
          <div className="font-medium">{doc.title}</div>
          {doc.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {doc.description}
            </p>
          )}
          {doc.amount_ttc != null && (
            <p className="mt-2 text-sm">
              Montant : <strong>{Number(doc.amount_ttc).toFixed(2)} €</strong>
            </p>
          )}
        </div>
      )}

      {isPending ? (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">
              Commentaire (optionnel)
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              placeholder="Ajoutez un mot pour le créateur du circuit…"
            />
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => m.mutate("approve")}
              disabled={m.isPending}
              className="flex-1"
            >
              Approuver
            </Button>
            <Button
              variant="destructive"
              onClick={() => m.mutate("reject")}
              disabled={m.isPending}
              className="flex-1"
            >
              Rejeter
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-sm">
          Cette étape a déjà été traitée
          {step.decided_at
            ? ` le ${new Date(step.decided_at).toLocaleString("fr-FR")}`
            : ""}.
          {step.comment && (
            <p className="mt-2 italic text-muted-foreground">
              « {step.comment} »
            </p>
          )}
        </div>
      )}
    </div>
  );
}
