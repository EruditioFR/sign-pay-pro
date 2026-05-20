import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SignatureCanvas from "react-signature-canvas";
import { getCurrentUser } from "@/lib/auth.functions";
import {
  getMyProviderSignature,
  saveMyProviderSignature,
} from "@/lib/provider-signature.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eraser, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const fetchMe = useServerFn(getCurrentUser);
  const fetchSig = useServerFn(getMyProviderSignature);
  const saveSig = useServerFn(saveMyProviderSignature);
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: sigData } = useQuery({
    queryKey: ["my-provider-signature"],
    queryFn: () => fetchSig(),
  });

  const sigRef = useRef<SignatureCanvas | null>(null);
  const [hasSaved, setHasSaved] = useState<string | null>(null);

  useEffect(() => {
    setHasSaved(sigData?.signature_image_b64 ?? null);
  }, [sigData?.signature_image_b64]);

  const save = useMutation({
    mutationFn: async () => {
      if (!sigRef.current || sigRef.current.isEmpty()) {
        throw new Error("Veuillez dessiner votre signature");
      }
      const dataUrl = sigRef.current.getCanvas().toDataURL("image/png");
      await saveSig({ data: { signature_image_b64: dataUrl } });
      return dataUrl;
    },
    onSuccess: (dataUrl) => {
      toast.success("Signature enregistrée");
      setHasSaved(dataUrl);
      sigRef.current?.clear();
      qc.invalidateQueries({ queryKey: ["my-provider-signature"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => saveSig({ data: { signature_image_b64: null } }),
    onSuccess: () => {
      toast.success("Signature supprimée");
      setHasSaved(null);
      qc.invalidateQueries({ queryKey: ["my-provider-signature"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.profile")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">{t("auth.full_name")} : </span>{me?.fullName}</div>
          <div><span className="text-muted-foreground">{t("auth.email")} : </span>{me?.email}</div>
          <div><span className="text-muted-foreground">{t("dashboard.your_org")} : </span>{me?.organizationName}</div>
          <div><span className="text-muted-foreground">{t("dashboard.your_role")} : </span>{me ? t(`roles.${me.primaryRole}`) : "—"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ma signature prestataire</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cette signature sera apposée automatiquement sur le PDF lorsque le
            client signe un de vos documents.
          </p>

          {hasSaved && (
            <div className="rounded-md border border-border bg-muted p-3">
              <div className="mb-2 text-xs text-muted-foreground">Signature enregistrée :</div>
              <img src={hasSaved} alt="Signature actuelle" className="max-h-24 bg-white rounded" />
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Supprimer
              </Button>
            </div>
          )}

          <div>
            <div className="mb-1 text-sm font-medium">
              {hasSaved ? "Remplacer par une nouvelle signature" : "Dessiner ma signature"}
            </div>
            <div className="rounded-md border border-border bg-background">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ className: "w-full h-40 touch-none" }}
                penColor="black"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sigRef.current?.clear()}
              >
                <Eraser className="mr-1 h-4 w-4" />
                Effacer
              </Button>
              <Button
                size="sm"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                <Save className="mr-1 h-4 w-4" />
                Enregistrer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
