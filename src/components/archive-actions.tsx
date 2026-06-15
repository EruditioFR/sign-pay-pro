import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  archiveDocument,
  unarchiveDocument,
  cancelDocument,
  type DocumentStatus,
} from "@/lib/documents.functions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  documentId: string;
  status: DocumentStatus | string;
}

export function ArchiveActions({ documentId, status }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [openArchive, setOpenArchive] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [retentionUntil, setRetentionUntil] = useState("");
  const [reason, setReason] = useState("");

  const archiveFn = useServerFn(archiveDocument);
  const unarchiveFn = useServerFn(unarchiveDocument);
  const cancelFn = useServerFn(cancelDocument);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["document", documentId] });
    qc.invalidateQueries({ queryKey: ["documents"] });
  };

  const archiveMut = useMutation({
    mutationFn: () =>
      archiveFn({
        data: { id: documentId, retention_until: retentionUntil || null, reason: reason || undefined },
      }),
    onSuccess: () => {
      toast.success(t("documents.archive.archive"));
      setOpenArchive(false);
      setRetentionUntil("");
      setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unarchiveMut = useMutation({
    mutationFn: () => unarchiveFn({ data: { id: documentId } }),
    onSuccess: () => {
      toast.success(t("documents.archive.unarchive"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { id: documentId, reason: reason || undefined } }),
    onSuccess: () => {
      toast.success(t("documents.archive.cancel"));
      setOpenCancel(false);
      setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (status === "archived") {
    return (
      <ConfirmAction
        title={t("documents.archive.unarchive")}
        description={t("documents.archive.confirm_unarchive")}
        confirmLabel={t("documents.archive.unarchive")}
        destructive={false}
        onConfirm={() => unarchiveMut.mutateAsync()}
        disabled={unarchiveMut.isPending}
      >
        <Button size="sm" variant="outline">
          <ArchiveRestore className="mr-1 h-4 w-4" />
          {t("documents.archive.unarchive")}
        </Button>
      </ConfirmAction>
    );
  }

  if (status === "cancelled") return null;

  const cancellable = !["paid", "signed"].includes(String(status));

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={openArchive} onOpenChange={setOpenArchive}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Archive className="mr-1 h-4 w-4" />
            {t("documents.archive.archive")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("documents.archive.archive")}</DialogTitle>
            <DialogDescription>{t("documents.archive.confirm_archive")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="retention">{t("documents.archive.retention_until")}</Label>
              <Input
                id="retention"
                type="date"
                value={retentionUntil}
                onChange={(e) => setRetentionUntil(e.target.value)}
                placeholder={t("documents.archive.retention_placeholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">{t("documents.archive.reason_placeholder")}</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenArchive(false)}>
              {t("common.cancel") || "Annuler"}
            </Button>
            <Button onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}>
              {t("documents.archive.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cancellable && (
        <Dialog open={openCancel} onOpenChange={setOpenCancel}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive">
              <Ban className="mr-1 h-4 w-4" />
              {t("documents.archive.cancel")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("documents.archive.cancel")}</DialogTitle>
              <DialogDescription>{t("documents.archive.confirm_cancel")}</DialogDescription>
            </DialogHeader>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("documents.archive.reason_placeholder")}
              rows={2}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenCancel(false)}>
                {t("common.cancel") || "Annuler"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
              >
                {t("documents.archive.cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
