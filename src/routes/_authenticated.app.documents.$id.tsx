import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDocument, getDocumentFileSignedUrl } from "@/lib/documents.functions";
import { getCurrentUser } from "@/lib/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentStatusBadge } from "@/components/status-badge";
import { DocumentUploader } from "@/components/document-uploader";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { ArrowLeft, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/documents/$id")({
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const fetchDoc = useServerFn(getDocument);
  const fetchMe = useServerFn(getCurrentUser);
  const signFn = useServerFn(getDocumentFileSignedUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDoc({ data: { id } }),
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const { document: doc, files, workflows } = data;

  const openFile = async (fileId: string) => {
    const { url } = await signFn({ data: { fileId } });
    window.open(url, "_blank", "noopener");
  };

  const lastWorkflow = workflows[0];

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/documents"><ArrowLeft className="mr-1 h-4 w-4" />{t("documents.title")}</Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{doc.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t(`documents.types.${doc.type}`)}
                {doc.reference && ` · ${doc.reference}`}
              </p>
            </div>
            <DocumentStatusBadge status={doc.status} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
          <div><strong>{t("documents.field.third_party")}:</strong> {doc.third_party_name ?? "—"}</div>
          <div><strong>{t("documents.field.amount_ttc")}:</strong> {doc.amount_ttc != null ? `${doc.amount_ttc} ${doc.currency}` : "—"}</div>
          <div><strong>{t("documents.field.issue_date")}:</strong> {doc.issue_date ?? "—"}</div>
          <div><strong>{t("documents.field.due_date")}:</strong> {doc.due_date ?? "—"}</div>
          {doc.description && <div className="md:col-span-2"><p className="whitespace-pre-line">{doc.description}</p></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("documents.field.title")} — fichiers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {me?.organizationId && (
            <DocumentUploader documentId={doc.id} organizationId={me.organizationId} />
          )}
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>v{f.version} — {f.file_name}</span>
                  <Button size="sm" variant="ghost" onClick={() => openFile(f.id)}>
                    <Download className="mr-1 h-4 w-4" />{t("common.save")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {lastWorkflow && (
        <Card>
          <CardHeader><CardTitle>{t("workflows.title")}</CardTitle></CardHeader>
          <CardContent>
            <WorkflowTimeline steps={lastWorkflow.document_workflow_steps ?? []} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
