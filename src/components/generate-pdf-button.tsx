import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { generateDocumentPdf } from "@/lib/pdf.functions";

export function GeneratePdfButton({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const fn = useServerFn(generateDocumentPdf);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => fn({ data: { documentId } }),
    onSuccess: () => {
      toast.success(t("pdf.generated"));
      qc.invalidateQueries({ queryKey: ["document", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button variant="secondary" size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
      <FileText className="mr-1 h-4 w-4" />
      {mut.isPending ? t("common.loading") : t("pdf.generate")}
    </Button>
  );
}
