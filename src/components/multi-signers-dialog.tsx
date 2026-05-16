import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createSignatureRequests,
  listSignatureRequests,
  cancelSignatureRequest,
} from "@/lib/signature-requests.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UsersRound, Plus, Trash2, Copy, Ban, CheckCircle2, Clock } from "lucide-react";

interface Row {
  signer_name: string;
  signer_email: string;
}

export function MultiSignersDialog({ documentId }: { documentId: string }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listSignatureRequests);
  const createFn = useServerFn(createSignatureRequests);
  const cancelFn = useServerFn(cancelSignatureRequest);
  const [open, setOpen] = useState(false);
  const [sequential, setSequential] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ signer_name: "", signer_email: "" }]);

  const { data, refetch } = useQuery({
    queryKey: ["sig_requests", documentId],
    queryFn: () => fetchList({ data: { document_id: documentId } }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          document_id: documentId,
          sequential,
          expires_in_days: 30,
          signers: rows
            .filter((r) => r.signer_name.trim() && r.signer_email.trim())
            .map((r, i) => ({
              signer_name: r.signer_name.trim(),
              signer_email: r.signer_email.trim(),
              order_index: i + 1,
            })),
        },
      }),
    onSuccess: () => {
      toast.success("Invitations envoyées");
      setRows([{ signer_name: "", signer_email: "" }]);
      qc.invalidateQueries({ queryKey: ["sig_requests", documentId] });
      refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sig_requests", documentId] });
      refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const submit = () => {
    const valid = rows.filter((r) => r.signer_name.trim() && r.signer_email.trim());
    if (valid.length === 0) return toast.error("Ajoutez au moins un signataire complet");
    createMutation.mutate();
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Lien copié");
  };

  const requests = data?.requests ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UsersRound className="mr-1 h-4 w-4" />
          Multi-signataires
          {requests.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {requests.filter((r) => r.status === "signed").length}/{requests.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inviter plusieurs signataires</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {requests.length > 0 && (
            <div className="rounded-md border border-border">
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium">
                Invitations en cours
              </div>
              <ul className="divide-y divide-border text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.signer_name}</span>
                        <StatusBadge status={r.status} />
                        {r.sequential && (
                          <Badge variant="outline" className="text-xs">
                            ordre {r.order_index}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.signer_email}
                        {r.signed_at ? ` · signé le ${new Date(r.signed_at).toLocaleString()}` : ""}
                      </div>
                    </div>
                    {r.status === "pending" && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => copyLink(r.token)} title="Copier le lien">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => cancelMutation.mutate(r.id)}
                          title="Annuler"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-medium">Nouveaux signataires</div>
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label className="text-xs">Nom</Label>
                  <Input
                    value={r.signer_name}
                    onChange={(e) =>
                      setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, signer_name: e.target.value } : p)))
                    }
                    placeholder="Marie Dupont"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={r.signer_email}
                    onChange={(e) =>
                      setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, signer_email: e.target.value } : p)))
                    }
                    placeholder="marie@example.com"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows((prev) => [...prev, { signer_name: "", signer_email: "" }])}
            >
              <Plus className="mr-1 h-4 w-4" /> Ajouter un signataire
            </Button>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sequential}
                onCheckedChange={(v) => setSequential(v === true)}
              />
              Signature séquentielle (dans l'ordre indiqué)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Fermer
          </Button>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Envoi…" : "Envoyer les invitations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "signed")
    return (
      <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> signé
      </Badge>
    );
  if (status === "declined")
    return (
      <Badge variant="destructive" className="gap-1">
        <Ban className="h-3 w-3" /> refusé
      </Badge>
    );
  if (status === "cancelled")
    return (
      <Badge variant="outline" className="gap-1">
        <Ban className="h-3 w-3" /> annulé
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" /> en attente
    </Badge>
  );
}
