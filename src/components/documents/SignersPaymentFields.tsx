import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { createSignatureRequests } from "@/lib/signature-requests.functions";
import { createDocumentPaymentLink } from "@/lib/stripe-payment-links.functions";

export type Signer = { signer_name: string; signer_email: string };

export type SignersPaymentValue = {
  signers: Signer[];
  expiresIn: number;
  paymentEnabled: boolean;
  paymentAmount: string;
};

export const emptySignersPaymentValue = (): SignersPaymentValue => ({
  signers: [{ signer_name: "", signer_email: "" }],
  expiresIn: 30,
  paymentEnabled: false,
  paymentAmount: "",
});

/**
 * Apply signers + Stripe Payment Link to a freshly created document.
 * Errors are toasted but never thrown — the document is already created.
 */
export async function applySignersAndPayment(
  v: SignersPaymentValue,
  ctx: { documentId: string; title: string; currency: string },
) {
  const validSigners = v.signers.filter(
    (s) => s.signer_name.trim() && s.signer_email.trim(),
  );
  const payAmount = v.paymentEnabled ? Number(v.paymentAmount) : 0;
  if (v.paymentEnabled && (!payAmount || payAmount <= 0)) {
    toast.error("Montant de paiement invalide — lien Stripe non créé.");
  } else if (v.paymentEnabled) {
    try {
      await createDocumentPaymentLink({
        data: {
          document_id: ctx.documentId,
          amount: payAmount,
          currency: ctx.currency,
          label: ctx.title || "Document",
        },
      });
      toast.success("Lien de paiement Stripe généré.");
    } catch (err) {
      toast.error(
        "Lien Stripe : " + (err instanceof Error ? err.message : "erreur"),
      );
    }
  }
  if (validSigners.length > 0) {
    try {
      await createSignatureRequests({
        data: {
          document_id: ctx.documentId,
          sequential: true,
          expires_in_days: v.expiresIn,
          signers: validSigners.map((s, idx) => ({
            signer_name: s.signer_name.trim(),
            signer_email: s.signer_email.trim(),
            order_index: idx + 1,
          })),
        },
      });
      toast.success(
        `Invitation${validSigners.length > 1 ? "s" : ""} envoyée${validSigners.length > 1 ? "s" : ""}.`,
      );
    } catch (err) {
      toast.error(
        "Signature : " + (err instanceof Error ? err.message : "erreur"),
      );
    }
  }
}

export function useSignersPaymentState() {
  const [value, setValue] = useState<SignersPaymentValue>(emptySignersPaymentValue);
  return { value, setValue } as const;
}

export function SignersPaymentFields({
  value,
  onChange,
  currencyHint = "EUR",
  compact,
}: {
  value: SignersPaymentValue;
  onChange: (next: SignersPaymentValue) => void;
  currencyHint?: string;
  compact?: boolean;
}) {
  const update = (patch: Partial<SignersPaymentValue>) => onChange({ ...value, ...patch });
  const updateSigner = (i: number, patch: Partial<Signer>) =>
    update({ signers: value.signers.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addSigner = () =>
    update({ signers: [...value.signers, { signer_name: "", signer_email: "" }] });
  const removeSigner = (i: number) =>
    update({ signers: value.signers.filter((_, idx) => idx !== i) });

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Destinataires pour signature</h3>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSigner} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ordre séquentiel. Laissez vide pour ne pas envoyer maintenant.
        </p>
        <div className="space-y-2">
          {value.signers.map((s, i) => (
            <div key={i} className="grid grid-cols-[20px_1fr_1fr_auto] items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{i + 1}.</span>
              <Input
                placeholder="Nom"
                value={s.signer_name}
                onChange={(e) => updateSigner(i, { signer_name: e.target.value })}
                className="h-8"
              />
              <Input
                type="email"
                placeholder="email@exemple.fr"
                value={s.signer_email}
                onChange={(e) => updateSigner(i, { signer_email: e.target.value })}
                className="h-8"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSigner(i)}
                disabled={value.signers.length === 1}
                className="h-8 w-8"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="sp-expires" className="text-xs">Valide (jours)</Label>
          <Input
            id="sp-expires"
            type="number"
            min={1}
            max={365}
            value={value.expiresIn}
            onChange={(e) => update({ expiresIn: Number(e.target.value) || 30 })}
            className="w-20 h-8"
          />
        </div>
      </div>

      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="sp-pay-toggle" className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm font-semibold">Demander un paiement</span>
            <span className="text-xs text-muted-foreground font-normal">(lien Stripe joint à l'email)</span>
          </Label>
          <Switch
            id="sp-pay-toggle"
            checked={value.paymentEnabled}
            onCheckedChange={(c) => update({ paymentEnabled: c })}
          />
        </div>
        {value.paymentEnabled && (
          <div className="grid gap-1">
            <Label htmlFor="sp-amount" className="text-xs">Montant ({currencyHint})</Label>
            <Input
              id="sp-amount"
              type="number"
              step="0.01"
              min="0.5"
              placeholder="0.00"
              value={value.paymentAmount}
              onChange={(e) => update({ paymentAmount: e.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
