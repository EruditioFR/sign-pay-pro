import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SignatureCanvas from "react-signature-canvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, PenLine, CreditCard, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/p/$token")({
  component: PublicSharePage,
});

interface ShareData {
  document: {
    id: string;
    type: string;
    title: string;
    reference: string | null;
    amount_ttc: number | null;
    currency: string;
    third_party_name: string | null;
    issue_date: string | null;
    due_date: string | null;
  };
  organization: { name: string; country: string } | null;
  pdfUrl: string | null;
  allow_sign: boolean;
  allow_pay: boolean;
  recipient_name: string | null;
  recipient_email: string | null;
}

function PublicSharePage() {
  const { token } = Route.useParams();
  const { t } = useTranslation();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    fetch(`/api/public/share/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("invalid"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold">{t("public.invalid_title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("public.invalid_text")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">{data.organization?.name}</div>
            <div className="text-xs text-muted-foreground">{t("public.shared_with_you")}</div>
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
              <iframe src={data.pdfUrl} className="h-[60vh] w-full rounded border" title="PDF" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("public.no_pdf")}</p>
            )}
          </CardContent>
        </Card>

        {(data.allow_sign || data.allow_pay) && (
          <Card>
            <CardHeader><CardTitle className="text-base">{t("public.actions")}</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue={data.allow_sign ? "sign" : "pay"}>
                <TabsList>
                  {data.allow_sign && <TabsTrigger value="sign"><PenLine className="mr-1 h-4 w-4" />{t("public.sign")}</TabsTrigger>}
                  {data.allow_pay && <TabsTrigger value="pay"><CreditCard className="mr-1 h-4 w-4" />{t("public.pay")}</TabsTrigger>}
                </TabsList>
                {data.allow_sign && (
                  <TabsContent value="sign">
                    {signed ? (
                      <SuccessBox text={t("public.signed_ok")} />
                    ) : (
                      <SignPanel
                        token={token}
                        defaultName={data.recipient_name ?? ""}
                        defaultEmail={data.recipient_email ?? ""}
                        onDone={() => setSigned(true)}
                      />
                    )}
                  </TabsContent>
                )}
                {data.allow_pay && (
                  <TabsContent value="pay">
                    {paid ? (
                      <SuccessBox text={t("public.paid_ok")} />
                    ) : (
                      <PayPanel
                        token={token}
                        amount={data.document.amount_ttc ?? 0}
                        currency={data.document.currency}
                        title={data.document.title}
                        reference={data.document.reference}
                        defaultPayerName={data.recipient_name ?? data.document.third_party_name ?? ""}
                        defaultPayerEmail={data.recipient_email ?? ""}
                        onDone={() => setPaid(true)}
                      />
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function SuccessBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 className="h-5 w-5" />
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

function SignPanel({
  token, defaultName, defaultEmail, onDone,
}: { token: string; defaultName: string; defaultEmail: string; onDone: () => void }) {
  const { t } = useTranslation();
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error(t("public.need_name"));
    if (sigRef.current?.isEmpty()) return toast.error(t("public.need_signature"));
    setSubmitting(true);
    try {
      const dataUrl = sigRef.current!.getCanvas().toDataURL("image/png");
      const res = await fetch(`/api/public/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          signer_name: name,
          signer_email: email || null,
          signature_image_b64: dataUrl,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "fail");
      }
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("public.signer_name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("public.signer_email")}</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>{t("public.draw_signature")}</Label>
        <div className="mt-1 rounded-md border bg-background">
          <SignatureCanvas ref={sigRef} canvasProps={{ className: "w-full h-40" }} />
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => sigRef.current?.clear()}>
          {t("public.clear")}
        </Button>
      </div>
      <Button onClick={submit} disabled={submitting} className="w-full">
        {submitting ? t("common.loading") : t("public.sign_now")}
      </Button>
    </div>
  );
}

function PayPanel({
  token, amount, currency, title, reference, defaultPayerName, defaultPayerEmail, onDone,
}: {
  token: string;
  amount: number;
  currency: string;
  title: string;
  reference: string | null;
  defaultPayerName: string;
  defaultPayerEmail: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [payerName, setPayerName] = useState(defaultPayerName);
  const [payerEmail, setPayerEmail] = useState(defaultPayerEmail);
  const [ref, setRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const formattedAmount = (() => {
    try {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
    } catch {
      return `${amount.toLocaleString()} ${currency}`;
    }
  })();
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail);

  const payOnline = async () => {
    if (!amount || amount <= 0) return toast.error(t("public.need_amount"));
    if (!validEmail) return toast.error(t("public.need_email"));
    setRedirecting(true);
    try {
      const res = await fetch(`/api/public/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stripe_checkout",
          amount,
          payer_name: payerName || null,
          payer_email: payerEmail || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j.error ?? "fail");
      window.location.href = j.url as string;
    } catch (e) {
      setRedirecting(false);
      toast.error((e as Error).message);
    }
  };

  const declareManual = async () => {
    if (!amount || amount <= 0) return toast.error(t("public.need_amount"));
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pay",
          amount,
          method: "bank_transfer",
          payer_name: payerName || null,
          payer_email: payerEmail || null,
          provider_ref: ref || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "fail");
      }
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pt-3">
      {/* Récapitulatif non modifiable */}
      <div className="rounded-md border bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("public.invoice_label")}</div>
            <div className="truncate text-sm font-medium">{title}</div>
            {reference && <div className="text-xs text-muted-foreground">N° {reference}</div>}
            <div className="mt-1 text-xs text-muted-foreground">{t("public.payment_date")} : {today}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("public.amount_ttc")}</div>
            <div className="text-2xl font-semibold tabular-nums">{formattedAmount}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("public.payer_name")}</Label>
          <Input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("public.payer_email")} *</Label>
          <Input type="email" required value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("public.receipt_hint")}</p>

      <Button onClick={payOnline} disabled={redirecting || submitting || !validEmail} className="w-full">
        <CreditCard className="mr-2 h-4 w-4" />
        {redirecting ? t("common.loading") : `${t("public.pay_now")} ${formattedAmount}`}
      </Button>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
        <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">{t("public.or")}</span></div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("public.declare_payment_hint")}</p>
        <div className="space-y-1">
          <Label>{t("public.payment_ref")}</Label>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("public.payment_ref_hint")} />
        </div>
        <Button variant="outline" onClick={declareManual} disabled={submitting || redirecting} className="w-full">
          {submitting ? t("common.loading") : t("public.declare_payment")}
        </Button>
      </div>
    </div>
  );
}
