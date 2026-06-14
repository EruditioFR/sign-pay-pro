import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  exportAuditLogs,
  exportSignatures,
  exportPayments,
} from "@/lib/exports.functions";
import { downloadCsv } from "@/lib/exports-client";

type Props = {
  /** When provided, restricts exports to this organization (super-admin only). */
  organizationId?: string | null;
  /** ISO from/to filters (audit only, used as date range hint). */
  from?: string | null;
  to?: string | null;
};

export function ActivityExportsMenu({ organizationId = null, from = null, to = null }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const fetchAudit = useServerFn(exportAuditLogs);
  const fetchSig = useServerFn(exportSignatures);
  const fetchPay = useServerFn(exportPayments);

  const today = new Date().toISOString().slice(0, 10);

  const run = async (
    key: "audit" | "signatures" | "payments",
    fn: () => Promise<unknown>,
    columns: string[],
    extractor: (r: unknown) => Record<string, unknown>[],
    filename: string,
  ) => {
    setBusy(key);
    try {
      const res = await fn();
      const rows = extractor(res);
      if (rows.length === 0) {
        toast.info("Aucune donnée à exporter");
        return;
      }
      downloadCsv(rows, columns as never, filename);
      toast.success(`${rows.length} ligne(s) exportée(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!!busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Exports
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Historiques (CSV)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            run(
              "audit",
              () =>
                fetchAudit({
                  data: { organizationId, from: from || null, to: to ? new Date(to + "T23:59:59").toISOString() : null, limit: 5000 },
                }),
              [
                "created_at",
                "action",
                "resource",
                "user_email",
                "user_full_name",
                "organization_name",
                "metadata",
              ],
              (r) => (r as { rows: Record<string, unknown>[] }).rows,
              `audit-logs-${today}.csv`,
            )
          }
        >
          Journal d'audit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            run(
              "signatures",
              () => fetchSig({ data: { organizationId, from: from || null, to: to ? new Date(to + "T23:59:59").toISOString() : null, limit: 5000 } }),
              [
                "signed_at",
                "document_title",
                "document_reference",
                "organization_name",
                "signer_name",
                "signer_email",
                "signature_level",
                "auth_method",
                "ip",
                "pdf_hash_sha256",
                "document_id",
              ],
              (r) => (r as { rows: Record<string, unknown>[] }).rows,
              `signatures-${today}.csv`,
            )
          }
        >
          Signatures
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            run(
              "payments",
              () => fetchPay({ data: { organizationId, from: from || null, to: to ? new Date(to + "T23:59:59").toISOString() : null, limit: 5000 } }),
              [
                "created_at",
                "paid_at",
                "document_title",
                "document_reference",
                "organization_name",
                "amount",
                "currency",
                "method",
                "status",
                "provider_ref",
                "document_id",
              ],
              (r) => (r as { rows: Record<string, unknown>[] }).rows,
              `payments-${today}.csv`,
            )
          }
        >
          Paiements
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
