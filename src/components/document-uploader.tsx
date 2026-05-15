import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { registerDocumentFile } from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";

interface Props {
  documentId: string;
  organizationId: string;
  onUploaded?: () => void;
}

export function DocumentUploader({ documentId, organizationId, onUploaded }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const register = useServerFn(registerDocumentFile);
  const qc = useQueryClient();

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("documents.upload.too_large"));
      return;
    }
    setBusy(true);
    try {
      const path = `${organizationId}/${documentId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      await register({
        data: {
          document_id: documentId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      toast.success(t("documents.upload.success"));
      qc.invalidateQueries({ queryKey: ["document", documentId] });
      onUploaded?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/60">
      <UploadCloud className="h-4 w-4" />
      {busy ? t("documents.upload.uploading") : t("documents.upload.label")}
      <input
        type="file"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="ghost" size="sm" disabled={busy} className="ml-auto pointer-events-none">
        {t("documents.upload.choose")}
      </Button>
    </label>
  );
}
