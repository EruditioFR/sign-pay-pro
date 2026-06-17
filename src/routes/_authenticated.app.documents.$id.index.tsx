import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDocument, getDocumentFileSignedUrl, isReadOnlyStatus } from "@/lib/documents.functions";
import { listDocumentSignatures, listDocumentPayments } from "@/lib/sharing.functions";
import { getCurrentUser } from "@/lib/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentStatusBadge } from "@/components/status-badge";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { computePaymentSummary } from "@/lib/payment-status";
import { DocumentUploader } from "@/components/document-uploader";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { SubmitDocumentButton } from "@/components/submit-document-button";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { PaymentDialog } from "@/components/payment-dialog";
import { SignDocumentDialog } from "@/components/sign-document-dialog";
import { SignedPdfPreview } from "@/components/signed-pdf-preview";
import { MultiSignersDialog } from "@/components/multi-signers-dialog";
import { ArchiveActions } from "@/components/archive-actions";
import { SignatureIntegrityPanel } from "@/components/signature-integrity-panel";
import { DocumentActivityPdfButton } from "@/components/document-activity-pdf-button";
import { ExportFacturXButton } from "@/components/export-factur-x-button";
import { ArrowLeft, Download, Edit3, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/documents/$id/")({
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const fetchDoc = useServerFn(getDocument);
  const fetchMe = useServerFn(getCurrentUser);
  const signFn = useServerFn(getDocumentFileSignedUrl);

  const fetchSigs = useServerFn(listDocumentSignatures);
  const fetchPays = useServerFn(listDocumentPayments);

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDoc({ data: { id } }),
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: sigs } = useQuery({
    queryKey: ["doc_signatures", id],
    queryFn: () => fetchSigs({ data: { document_id: id } }),
  });
  const { data: pays } = useQuery({
    queryKey: ["doc_payments", id],
    queryFn: () => fetchPays({ data: { document_id: id } }),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const { document: doc, files, workflows } = data;

  const openFile = async (fileId: string) => {
    const { url } = await signFn({ data: { fileId } });
    window.open(url, "_blank", "noopener");
  };

  const lastWorkflow = workflows[0];
  const readOnly = isReadOnlyStatus(doc.status);

  const isInvoice = doc.type === "invoice";
  const isQuote = doc.type === "quote";
  const isSigned = (sigs?.signatures ?? []).length > 0 || doc.status === "signed";
  const paymentSummary = computePaymentSummary({
    documentStatus: doc.status,
    amountTtc: doc.amount_ttc,
    dueDate: doc.due_date,
    payments: pays?.payments ?? [],
  });
  const isFullyPaid = paymentSummary.status === "paid";

  // Quote: signature required, no payment. Hide sign/send once signed.
  // Invoice: payment only, no signature. Hide send once fully paid.
  // Other types: keep prior behavior.
  const showSignButtons = !isInvoice && !isSigned;
  const showSendButton = isInvoice ? !isFullyPaid : !isSigned;
  const showPaymentButton = !isQuote && !isFullyPaid;
  const sendLabel = isInvoice ? t("sharing.send_payment_request", { defaultValue: "Envoyer demande de paiement" }) : undefined;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/documents"><ArrowLeft className="mr-1 h-4 w-4" />{t("documents.title")}</Link>
      </Button>

      {doc.status === "archived" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span>{t("documents.archive.archived_banner")}</span>
          {doc.archived_at && (
            <span className="text-xs text-muted-foreground ml-auto">
              {new Date(doc.archived_at).toLocaleString()}
              {doc.retention_until && ` · ${t("documents.archive.retention_until")} ${doc.retention_until}`}
            </span>
          )}
        </div>
      )}
      {doc.status === "cancelled" && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <Lock className="h-4 w-4 text-destructive" />
          <span>{t("documents.archive.cancelled_banner")}</span>
        </div>
      )}

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
            <div className="flex flex-wrap items-center gap-2">
              <DocumentStatusBadge status={doc.status} />
              <PaymentStatusBadge
                documentStatus={doc.status}
                amountTtc={doc.amount_ttc}
                dueDate={doc.due_date}
                payments={pays?.payments ?? []}
                hideWhenNotApplicable
              />
              {!readOnly && doc.status === "draft" && (
                <SubmitDocumentButton documentId={doc.id} documentType={doc.type} />
              )}
              {!readOnly && files.length > 0 && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/app/documents/$id/editor" params={{ id: doc.id }}>
                    <Edit3 className="mr-1 h-4 w-4" /> Éditer le PDF
                  </Link>
                </Button>
              )}
              {!readOnly && ["draft", "validated", "sent", "signed", "partially_paid"].includes(doc.status) && (
                <>
                  <GeneratePdfButton documentId={doc.id} />
                  {showSendButton && doc.status !== "draft" && <ShareLinkDialog documentId={doc.id} triggerLabel={sendLabel} />}
                  {showSignButtons && (
                    <>
                      <SignDocumentDialog
                        documentId={doc.id}
                        defaultName={me?.fullName ?? undefined}
                        defaultEmail={me?.email ?? undefined}
                      />
                      <MultiSignersDialog documentId={doc.id} />
                    </>
                  )}
                  {showPaymentButton && (
                    <PaymentDialog documentId={doc.id} suggestedAmount={doc.amount_ttc ?? undefined} currency={doc.currency} />
                  )}
                </>
              )}
              {readOnly && files.length > 0 && <GeneratePdfButton documentId={doc.id} />}
              <DocumentActivityPdfButton documentId={doc.id} />
              <ExportFacturXButton documentId={doc.id} documentType={doc.type} />
              <ArchiveActions documentId={doc.id} status={doc.status} />
            </div>
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
          {me?.organizationId && !readOnly && (
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

      <Card>
        <CardHeader><CardTitle>{t("doc_detail.signatures")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <SignatureIntegrityPanel
            documentId={doc.id}
            documentTitle={doc.title}
            hasSignatures={(sigs?.signatures ?? []).length > 0}
          />
          {(sigs?.signatures ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("doc_detail.no_signatures")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {(sigs?.signatures ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.signer_name}</span>
                      {s.signature_level && (
                        <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {String(s.signature_level).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.signer_email ?? "—"} · {new Date(s.signed_at).toLocaleString()}
                      {s.ip ? ` · IP ${s.ip}` : ""}
                      {s.pdf_hash_sha256 ? ` · SHA-256 ${s.pdf_hash_sha256.slice(0, 12)}…` : ""}
                    </div>
                  </div>
                  {s.pdf_storage_path && (
                    <SignedPdfPreview
                      path={s.pdf_storage_path}
                      fileName={`${doc.reference ?? doc.title}-signed.pdf`}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("doc_detail.payments")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const summary = computePaymentSummary({
              documentStatus: doc.status,
              amountTtc: doc.amount_ttc,
              dueDate: doc.due_date,
              payments: pays?.payments ?? [],
            });
            if (summary.status === "not_applicable") return null;
            return (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <PaymentStatusBadge
                  documentStatus={doc.status}
                  amountTtc={doc.amount_ttc}
                  dueDate={doc.due_date}
                  payments={pays?.payments ?? []}
                />
                <span className="text-muted-foreground">
                  {summary.paidAmount.toLocaleString()} / {summary.dueAmount.toLocaleString()} {doc.currency}
                </span>
                {summary.remaining > 0 && (
                  <span className="text-muted-foreground">
                    · {t("payment_status.tooltip.remaining", { defaultValue: "Restant" })}:{" "}
                    {summary.remaining.toLocaleString()} {doc.currency}
                  </span>
                )}
              </div>
            );
          })()}
          {(pays?.payments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("doc_detail.no_payments")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {(pays?.payments ?? []).map((p) => {
                const meta = (p.metadata ?? {}) as Record<string, unknown>;
                const isStripe = meta.provider === "stripe" || p.method === "card";
                const kindLabel = isStripe
                  ? t("payments.kind.stripe", { defaultValue: "Paiement en ligne (Stripe)" })
                  : t("payments.kind.manual", { defaultValue: "Paiement enregistré manuellement" });
                const kindClass = isStripe
                  ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                  : "bg-slate-500/15 text-slate-700 dark:text-slate-300";
                return (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.amount} {p.currency}</span>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${kindClass}`}>
                          {kindLabel}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(`payments.methods.${p.method}`, { defaultValue: p.method })} · {t(`payments.status.${p.status}`, { defaultValue: p.status })}
                        {p.paid_at ? ` · ${new Date(p.paid_at).toLocaleDateString()}` : ""}
                        {p.provider_ref ? ` · ${p.provider_ref}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
