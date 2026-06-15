import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { recordManualPayment } from "@/lib/sharing.functions";

export function PaymentDialog({ documentId, suggestedAmount, currency }: {
  documentId: string; suggestedAmount?: number; currency?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggestedAmount ?? 0);
  const [method, setMethod] = useState<"manual" | "bank_transfer" | "cash" | "check">("bank_transfer");
  const [ref, setRef] = useState("");
  const qc = useQueryClient();
  const fn = useServerFn(recordManualPayment);

  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        document_id: documentId,
        amount, currency: currency || "EUR", method,
        provider_ref: ref || null,
      },
    }),
    onSuccess: (res) => {
      const clamped = res?.clamped_amount;
      const requested = res?.requested_amount;
      if (typeof clamped === "number" && typeof requested === "number" && clamped < requested) {
        toast.success(
          t("payments.recorded_clamped", {
            defaultValue: `Paiement enregistré (montant ajusté au restant dû : ${clamped} ${currency || "EUR"})`,
            amount: clamped,
            currency: currency || "EUR",
          }),
        );
      } else {
        toast.success(t("payments.recorded", { defaultValue: "Paiement enregistré" }));
      }
      qc.invalidateQueries({ queryKey: ["document", documentId] });
      qc.invalidateQueries({ queryKey: ["doc_payments", documentId] });
      qc.invalidateQueries({ queryKey: ["payments", documentId] });
      setOpen(false);
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        document_already_paid: t("payments.err.already_paid", {
          defaultValue: "Ce document est déjà entièrement payé.",
        }),
        amount_out_of_range: t("payments.err.amount_out_of_range", {
          defaultValue: "Le montant dépasse le restant dû.",
        }),
        document_not_found: t("payments.err.not_found", {
          defaultValue: "Document introuvable.",
        }),
      };
      toast.error(map[e.message] ?? e.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="mr-1 h-4 w-4" />
          {t("payments.record_manual", { defaultValue: "Enregistrer un paiement (hors ligne)" })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("payments.record_manual_title", {
              defaultValue: "Enregistrer un paiement reçu hors ligne",
            })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("payments.manual_hint", {
              defaultValue:
                "Utilisez ce formulaire uniquement pour les paiements reçus par virement, chèque ou espèces. Les paiements en ligne (Stripe) sont enregistrés automatiquement.",
            })}
          </p>
          <div className="space-y-1">
            <Label>{t("payments.amount")} ({currency || "EUR"})</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>{t("payments.method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">{t("payments.bank_transfer")}</SelectItem>
                <SelectItem value="cash">{t("payments.cash")}</SelectItem>
                <SelectItem value="check">{t("payments.check")}</SelectItem>
                <SelectItem value="manual">{t("payments.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("payments.reference")}</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
