import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, PenLine, CheckCircle2, Clock, Ban } from "lucide-react";

export const Route = createFileRoute("/s/$token")({
  component: PublicSignRequestPage,
});

interface SignData {
  document: {
    id: string;
    title: string;
    reference: string | null;
    amount_ttc: number | null;
    currency: string;
    issue_date: string | null;
  };
  organization: { name: string; country: string } | null;
  pdfUrl: string | null;
  request: {
    id: string;
    signer_name: string;
    signer_email: string;
    order_index: number;
    sequential: boolean;
    status: "pending" | "signed" | "declined" | "cancelled";
    expires_at: string | null;
    signed_at: string | null;
  };
  can_sign: boolean;
}

function PublicSignRequestPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<SignData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<"signed" | "declined" | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/public/sign-request/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("invalid"))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [token]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Chargement…</div>;
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold">Lien invalide ou expiré</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette invitation de signature n'est plus accessible.
          </p>
        </div>
      </div>
    );
  }

  const status = done ?? data.request.status;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">{data.organization?.name}</div>
            <div className="text-xs text-muted-foreground">
              Invitation à signer · {data.request.signer_name}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{data.document.title}</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {data.document.reference && <span>N° {data.document.reference}</span>}
              {data.document.issue_date && <span>· {data.document.issue_date}</span>}
              {data.document.amount_ttc != null && (
                <span className="font-semibold text-foreground">
                  · {data.document.amount_ttc.toLocaleString()} {data.document.currency}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {data.pdfUrl ? (
              <iframe src={data.pdfUrl} className="h-[55vh] w-full rounded border" title="PDF" />
            ) : (
              <p className="text-sm text-muted-foreground">Aucun PDF disponible.</p>
            )}
          </CardContent>
        </Card>

        {status === "signed" && (
          <StatusBox tone="ok" icon={<CheckCircle2 className="h-5 w-5" />}>
            Signature enregistrée. Merci !
          </StatusBox>
        )}
        {status === "declined" && (
          <StatusBox tone="warn" icon={<Ban className="h-5 w-5" />}>
            Vous avez refusé de signer ce document.
          </StatusBox>
        )}
        {status === "cancelled" && (
          <StatusBox tone="warn" icon={<Ban className="h-5 w-5" />}>
            Cette invitation a été annulée par l'émetteur.
          </StatusBox>
        )}

        {status === "pending" && !data.can_sign && (
          <StatusBox tone="info" icon={<Clock className="h-5 w-5" />}>
            En attente de la signature des signataires précédents avant que vous puissiez signer.
          </StatusBox>
        )}

        {status === "pending" && data.can_sign && (
          <SignPanel
            token={token}
            onSigned={() => {
              setDone("signed");
              refresh();
            }}
            onDeclined={() => {
              setDone("declined");
              refresh();
            }}
          />
        )}
      </main>
    </div>
  );
}

function StatusBox({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "warn" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return (
    <div className={`flex items-center gap-3 rounded-md p-4 ${toneClass}`}>
      {icon}
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

function SignPanel({
  token,
  onSigned,
  onDeclined,
}: {
  token: string;
  onSigned: () => void;
  onDeclined: () => void;
}) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  const sign = async () => {
    if (sigRef.current?.isEmpty()) return toast.error("Veuillez signer dans le cadre.");
    setSubmitting(true);
    try {
      const dataUrl = sigRef.current!.getTrimmedCanvas().toDataURL("image/png");
      const res = await fetch(`/api/public/sign-request/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", signature_image_b64: dataUrl }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Échec");
      }
      onSigned();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    setDeclining(true);
    try {
      const res = await fetch(`/api/public/sign-request/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline", reason: reason || null }),
      });
      if (!res.ok) throw new Error("Échec");
      onDeclined();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeclining(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4" /> Signer ce document
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Tracez votre signature</Label>
          <div className="mt-1 rounded-md border bg-background">
            <SignatureCanvas ref={sigRef} canvasProps={{ className: "w-full h-40" }} />
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => sigRef.current?.clear()}>
            Effacer
          </Button>
        </div>
        <Button onClick={sign} disabled={submitting} className="w-full">
          {submitting ? "Envoi…" : "Signer maintenant"}
        </Button>

        {!showDecline ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowDecline(true)}>
            Refuser de signer
          </Button>
        ) : (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Motif (optionnel)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Expliquez brièvement pourquoi vous refusez."
            />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={decline} disabled={declining}>
                Confirmer le refus
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDecline(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
