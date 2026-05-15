import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkflowTemplates, submitDocumentForValidation } from "@/lib/workflows.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  documentId: string;
  documentType: string;
}

export function SubmitDocumentButton({ documentId, documentType }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tplId, setTplId] = useState<string | undefined>();
  const qc = useQueryClient();
  const list = useServerFn(listWorkflowTemplates);
  const submit = useServerFn(submitDocumentForValidation);

  const { data } = useQuery({
    queryKey: ["workflow_templates"],
    queryFn: () => list(),
    enabled: open,
  });

  const templates = (data?.templates ?? []).filter(
    (tpl) => tpl.active && (!tpl.document_type || tpl.document_type === documentType)
  );

  const mut = useMutation({
    mutationFn: () => submit({ data: { documentId, templateId: tplId! } }),
    onSuccess: () => {
      toast.success("Document soumis à validation.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["document", documentId] });
      qc.invalidateQueries({ queryKey: ["my_approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="mr-1 h-4 w-4" />Soumettre à validation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choisir un workflow</DialogTitle>
        </DialogHeader>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun modèle de workflow disponible. Créez-en un d'abord.
          </p>
        ) : (
          <Select value={tplId} onValueChange={setTplId}>
            <SelectTrigger><SelectValue placeholder="Sélectionnez un workflow" /></SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={!tplId || mut.isPending}>
            {mut.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
