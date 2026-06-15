import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Loader2, Send, SkipForward, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocument } from "@/lib/documents.functions";
import {
  SignersPaymentFields,
  applySignersAndPayment,
  emptySignersPaymentValue,
  type SignersPaymentValue,
} from "@/components/documents/SignersPaymentFields";

export const Route = createFileRoute("/_authenticated/app/documents/$id/configure")({
  component: ConfigureDocumentPage,
});

function ConfigureDocumentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getDocumentFn = useServerFn(getDocument);

  const [value, setValue] = useState<SignersPaymentValue>(emptySignersPaymentValue);

  const docQ = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocumentFn({ data: { id } }),
  });

  const doc = docQ.data?.document as
    | { id: string; title: string; document_type: string; currency?: string | null }
    | undefined;

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!doc) throw new Error("Document introuvable");
      await applySignersAndPayment(value, {
        documentId: doc.id,
        title: doc.title,
        currency: doc.currency || "EUR",
      });
    },
    onSuccess: () => {
      navigate({ to: "/app/documents/$id/editor", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/drafts">
            <ArrowLeft className="mr-1 h-4 w-4" /> Brouillons
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" /> Configurer l'envoi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {docQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : doc ? (
            <>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium">{doc.title}</div>
                <div className="text-xs text-muted-foreground">
                  Type : {doc.document_type} · Devise : {doc.currency || "EUR"}
                </div>
                <Link
                  to="/app/documents/$id/editor"
                  params={{ id }}
                  className="text-xs text-primary hover:underline"
                >
                  Voir le PDF généré →
                </Link>
              </div>

              <SignersPaymentFields
                value={value}
                onChange={setValue}
                currencyHint={doc.currency || "EUR"}
              />

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="ghost"
                  onClick={() =>
                    navigate({ to: "/app/documents/$id/editor", params: { id } })
                  }
                  disabled={sendMut.isPending}
                >
                  <SkipForward className="mr-1 h-4 w-4" /> Ignorer
                </Button>
                <Button
                  onClick={() => sendMut.mutate()}
                  disabled={sendMut.isPending}
                >
                  {sendMut.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  Envoyer pour signature
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-destructive">Document introuvable.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
