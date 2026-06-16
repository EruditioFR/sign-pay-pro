import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GripVertical, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sendQuoteToRecipients, sendInvoiceToRecipients } from "@/lib/facturation.functions";

type Recipient = { id: string; name: string; email: string };

const newRow = (): Recipient => ({
  id: crypto.randomUUID(),
  name: "",
  email: "",
});

interface Props {
  documentId: string;
  defaultRecipient?: { name?: string | null; email?: string | null };
  disabled?: boolean;
  onSent?: () => void;
  kind?: "quote" | "invoice";
}

export function SendQuoteDialog({ documentId, defaultRecipient, disabled, onSent, kind = "quote" }: Props) {
  const qc = useQueryClient();
  const sendFn = useServerFn(kind === "invoice" ? sendInvoiceToRecipients : sendQuoteToRecipients);
  const kindLabel = kind === "invoice" ? "la facture" : "le devis";
  const sentLabel = kind === "invoice" ? "Facture envoyée" : "Devis envoyé";
  const [open, setOpen] = useState(false);
  const [sequential, setSequential] = useState(false);
  const [rows, setRows] = useState<Recipient[]>(() => [
    {
      id: crypto.randomUUID(),
      name: defaultRecipient?.name ?? "",
      email: defaultRecipient?.email ?? "",
    },
  ]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Recipient>) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const remove = (id: string) =>
    setRows((p) => (p.length === 1 ? p : p.filter((r) => r.id !== id)));

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setRows((p) => {
      const from = p.findIndex((r) => r.id === fromId);
      const to = p.findIndex((r) => r.id === toId);
      if (from < 0 || to < 0) return p;
      const next = [...p];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const send = useMutation({
    mutationFn: () => {
      const recipients = rows
        .map((r) => ({ name: r.name.trim(), email: r.email.trim() }))
        .filter((r) => r.name && r.email);
      if (recipients.length === 0) {
        throw new Error("Ajoutez au moins un destinataire valide.");
      }
      return sendFn({
        data: { documentId, recipients, sequential },
      });
    },
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.ok).length;
      const fail = res.results.length - ok;
      if (fail === 0) toast.success(`Devis envoyé à ${ok} destinataire(s).`);
      else toast.warning(`Envoyé à ${ok}, échec ${fail}.`);
      qc.invalidateQueries({ queryKey: ["facturation_quote", documentId] });
      qc.invalidateQueries({ queryKey: ["facturation_quotes"] });
      setOpen(false);
      onSent?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
        >
          <Send className="mr-1 h-4 w-4" /> Envoyer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Envoyer le devis</DialogTitle>
          <DialogDescription>
            Ajoutez les destinataires et définissez leur ordre de priorité par
            glisser-déposer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((r, i) => {
            const isDragging = dragId === r.id;
            const isOver = overId === r.id && dragId !== r.id;
            return (
              <div
                key={r.id}
                draggable
                onDragStart={() => setDragId(r.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overId !== r.id) setOverId(r.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) reorder(dragId, r.id);
                  setDragId(null);
                  setOverId(null);
                }}
                className={[
                  "flex items-end gap-2 rounded-md border bg-background p-2 transition",
                  isDragging ? "opacity-50" : "",
                  isOver ? "border-[color:var(--facturation)] ring-1 ring-[color:var(--facturation)]/40" : "border-border",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="cursor-grab self-center text-muted-foreground hover:text-foreground"
                  aria-label="Déplacer"
                  title="Glisser pour réordonner"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-[color:var(--facturation)]/10 text-xs font-semibold text-[color:var(--facturation)]">
                  {i + 1}
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Nom</Label>
                    <Input
                      value={r.name}
                      onChange={(e) => update(r.id, { name: e.target.value })}
                      placeholder="Marie Dupont"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      value={r.email}
                      onChange={(e) => update(r.id, { email: e.target.value })}
                      placeholder="marie@example.com"
                    />
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(r.id)}
                  disabled={rows.length === 1}
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows((p) => [...p, newRow()])}
          >
            <Plus className="mr-1 h-4 w-4" /> Ajouter un destinataire
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={sequential}
            onCheckedChange={(v) => setSequential(v === true)}
          />
          Envoi séquentiel (dans l'ordre indiqué)
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending}
            className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
          >
            <Send className="mr-1 h-4 w-4" />
            {send.isPending ? "Envoi…" : "Envoyer maintenant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
