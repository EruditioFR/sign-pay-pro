import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SignatureCanvas from "react-signature-canvas";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenLine, Eraser } from "lucide-react";
import { toast } from "sonner";
import { signDocumentInternal } from "@/lib/sharing.functions";

export function SignDocumentDialog({
  documentId,
  defaultName,
  defaultEmail,
}: {
  documentId: string;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const sigRef = useRef<SignatureCanvas | null>(null);
  const qc = useQueryClient();
  const fn = useServerFn(signDocumentInternal);

  const mut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t("public.need_name"));
      if (!sigRef.current || sigRef.current.isEmpty()) throw new Error(t("public.need_signature"));
      const dataUrl = sigRef.current.getCanvas().toDataURL("image/png");
      return fn({
        data: {
          document_id: documentId,
          signer_name: name.trim(),
          signer_email: email.trim() || null,
          signature_image_b64: dataUrl,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`${t("public.signed_ok")} (SHA-256: ${res.hash.slice(0, 12)}…)`);
      qc.invalidateQueries({ queryKey: ["doc_signatures", documentId] });
      qc.invalidateQueries({ queryKey: ["document", documentId] });
      setOpen(false);
      sigRef.current?.clear();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PenLine className="mr-1 h-4 w-4" />
          {t("public.sign")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("public.sign")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("public.signer_name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
          </div>
          <div className="space-y-1">
            <Label>{t("public.signer_email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("public.draw_signature")}</Label>
            <div className="rounded-md border border-border bg-background">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ className: "w-full h-40 touch-none" }}
                penColor="black"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => sigRef.current?.clear()}
            >
              <Eraser className="mr-1 h-4 w-4" />
              {t("public.clear")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? t("common.loading") : t("public.sign_now")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
