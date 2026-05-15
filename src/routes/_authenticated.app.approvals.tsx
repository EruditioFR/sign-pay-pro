import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { approveStep, listMyPendingApprovals, rejectStep } from "@/lib/workflows.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(listMyPendingApprovals);
  const approve = useServerFn(approveStep);
  const reject = useServerFn(rejectStep);

  const { data, isLoading } = useQuery({
    queryKey: ["my_approvals"],
    queryFn: () => list(),
  });

  const [comments, setComments] = useState<Record<string, string>>({});

  const approveMut = useMutation({
    mutationFn: (vars: { stepId: string; comment?: string }) =>
      approve({ data: { stepId: vars.stepId, comment: vars.comment } }),
    onSuccess: () => {
      toast.success("Étape approuvée.");
      qc.invalidateQueries({ queryKey: ["my_approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectMut = useMutation({
    mutationFn: (vars: { stepId: string; comment?: string }) =>
      reject({ data: { stepId: vars.stepId, comment: vars.comment } }),
    onSuccess: () => {
      toast.success("Étape rejetée.");
      qc.invalidateQueries({ queryKey: ["my_approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const steps = (data?.steps ?? []) as Array<{
    id: string;
    name: string;
    position: number;
    document_workflows: {
      document_id: string;
      documents: { id: string; title: string; type: string };
    } | null;
  }>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("approvals.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("approvals.subtitle")}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : steps.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("documents.empty")}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {steps.map((step) => {
            const doc = step.document_workflows?.documents;
            return (
              <Card key={step.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      <FileText className="mr-2 inline h-4 w-4" />
                      {doc?.title ?? "Document"}
                    </CardTitle>
                    {doc && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/app/documents/$id" params={{ id: doc.id }}>Voir</Link>
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Étape #{step.position} — {step.name}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Commentaire (facultatif)"
                    value={comments[step.id] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [step.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMut.mutate({ stepId: step.id, comment: comments[step.id] })}
                      disabled={approveMut.isPending}
                    >
                      <Check className="mr-1 h-4 w-4" />Approuver
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => rejectMut.mutate({ stepId: step.id, comment: comments[step.id] })}
                      disabled={rejectMut.isPending}
                    >
                      <X className="mr-1 h-4 w-4" />Rejeter
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
