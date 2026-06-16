import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateDocument } from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  documentId: string;
  /** kept for API compatibility */
  documentType?: string;
}

/**
 * "Prêt à envoyer" — replaces the legacy workflow / "soumettre à validation" flow.
 * Asks a single confirmation, then transitions the draft to `validated` so the
 * user can immediately use the signature / share actions.
 */
export function SubmitDocumentButton({ documentId }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateDocument);

  const mut = useMutation({
    mutationFn: () => updateFn({ data: { id: documentId, status: "validated" } }),
    onSuccess: () => {
      toast.success("Document prêt — vous pouvez l'envoyer aux signataires.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["document", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="mr-1 h-4 w-4" />Prêt à envoyer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer le document aux signataires&nbsp;?</DialogTitle>
          <DialogDescription>
            Votre document est-il prêt&nbsp;? Une fois confirmé, vous pourrez
            l'envoyer immédiatement aux signataires depuis les actions
            «&nbsp;Signataires&nbsp;» et «&nbsp;Partager&nbsp;».
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={mut.isPending}>
            Pas encore
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Oui, c'est prêt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
