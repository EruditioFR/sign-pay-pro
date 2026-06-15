import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldAlert, ShieldCheck, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  verifyDocumentSignaturesIntegrity,
  exportSignatureAuditTrail,
} from "@/lib/signature-verification.functions";

interface Props {
  documentId: string;
  documentTitle: string;
  hasSignatures: boolean;
}

export function SignatureIntegrityPanel({ documentId, documentTitle, hasSignatures }: Props) {
  const qc = useQueryClient();
  const verifyFn = useServerFn(verifyDocumentSignaturesIntegrity);
  const exportFn = useServerFn(exportSignatureAuditTrail);

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { document_id: documentId } }),
    onSuccess: (res) => {
      qc.setQueryData(["signature_integrity", documentId], res);
      if (res.summary.altered > 0) {
        toast.error(`Altération détectée sur ${res.summary.altered} signature(s).`);
      } else if (res.summary.unverifiable > 0) {
        toast.warning(`${res.summary.unverifiable} signature(s) non vérifiable(s).`);
      } else {
        toast.success(`${res.summary.verified} signature(s) intègre(s).`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportTrail = useMutation({
    mutationFn: () => exportFn({ data: { document_id: documentId } }),
    onSuccess: (trail) => {
      const blob = new Blob([JSON.stringify(trail, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-trail-${documentTitle.replace(/\W+/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Piste d'audit téléchargée.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = qc.getQueryData<Awaited<ReturnType<typeof verifyFn>>>([
    "signature_integrity",
    documentId,
  ]);

  if (!hasSignatures) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {data?.summary.altered ? (
            <ShieldAlert className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          )}
          Intégrité des signatures
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => verify.mutate()}
            disabled={verify.isPending}
          >
            {verify.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            )}
            Vérifier
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => exportTrail.mutate()}
            disabled={exportTrail.isPending}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Audit trail (JSON)
          </Button>
        </div>
      </div>

      {data && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{data.summary.verified} intègre(s)</Badge>
            {data.summary.altered > 0 && (
              <Badge variant="destructive">{data.summary.altered} altérée(s)</Badge>
            )}
            {data.summary.unverifiable > 0 && (
              <Badge variant="secondary">{data.summary.unverifiable} non vérifiable(s)</Badge>
            )}
          </div>
          {data.summary.altered > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-destructive">
              {data.checks
                .filter((c) => c.ok === false)
                .map((c) => (
                  <li key={c.signature_id}>
                    ⚠ {c.signer_name} ({c.signer_email}) — hash attendu {c.expected_hash?.slice(0, 12)}…, obtenu {c.actual_hash?.slice(0, 12)}…
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
