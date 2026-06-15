import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listPdpQueue } from "@/lib/pdp/queue.functions";
import {
  enqueueInvoiceTransmission,
  processInvoiceTransmission,
  refreshInvoiceTransmission,
} from "@/lib/pdp/transmission-service.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PdpStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Send, Loader2, Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/pdp-queue")({
  component: PdpQueuePage,
});

type StatusFilter = "pending" | "submitted" | "acknowledged" | "rejected" | "error" | "all";

// Labels/colors centralisés dans PdpStatusBadge (status-badge.tsx).

function PdpQueuePage() {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const fetchList = useServerFn(listPdpQueue);
  const enqueue = useServerFn(enqueueInvoiceTransmission);
  const process = useServerFn(processInvoiceTransmission);
  const refresh = useServerFn(refreshInvoiceTransmission);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pdp-queue", status],
    queryFn: () => fetchList({ data: { status, limit: 100 } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pdp-queue"] });

  const enqueueMut = useMutation({
    mutationFn: (documentId: string) => enqueue({ data: { documentId, format: "factur_x" } }),
    onSuccess: () => { toast.success("Facture mise en file de transmission"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const processMut = useMutation({
    mutationFn: (transmissionId: string) => process({ data: { transmissionId } }),
    onSuccess: () => { toast.success("Transmission déclenchée"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: (transmissionId: string) => refresh({ data: { transmissionId } }),
    onSuccess: () => { toast.success("Statut PDP rafraîchi"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">File de transmission PDP</h1>
          <p className="text-sm text-muted-foreground">
            Suivi des factures à transmettre à la Plateforme de Dématérialisation Partenaire.
          </p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="submitted">Transmises</SelectItem>
            <SelectItem value="acknowledged">Acquittées</SelectItem>
            <SelectItem value="rejected">Rejetées</SelectItem>
            <SelectItem value="error">Erreur</SelectItem>
            <SelectItem value="all">Toutes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {items.length} facture{items.length > 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Aucune facture dans cette file"
              description="Les factures émises seront listées ici dès qu'elles seront mises en file pour transmission PDP."
            />
          ) : (
            <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° facture</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Montant TTC</TableHead>
                    <TableHead>Statut PDP</TableHead>
                    <TableHead>Connecteur</TableHead>
                    <TableHead>Dernière erreur</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.documentId}>
                      <TableCell className="font-mono text-xs">
                        {item.invoiceNumber ?? "—"}
                      </TableCell>
                      <TableCell>{item.buyerName ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: item.currency,
                        }).format(item.amountTtc)}
                      </TableCell>
                      <TableCell>
                        <PdpStatusBadge status={item.pdpStatus} />
                      </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.pdpProvider ?? "noop"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-destructive">
                      {item.lastError ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!item.transmissionId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => enqueueMut.mutate(item.documentId)}
                            disabled={enqueueMut.isPending}
                          >
                            <Send className="mr-1 h-3 w-3" /> Mettre en file
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => processMut.mutate(item.transmissionId!)}
                              disabled={processMut.isPending}
                            >
                              <Send className="mr-1 h-3 w-3" /> Transmettre
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => refreshMut.mutate(item.transmissionId!)}
                              disabled={refreshMut.isPending}
                            >
                              <RefreshCw className="mr-1 h-3 w-3" /> Statut
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
