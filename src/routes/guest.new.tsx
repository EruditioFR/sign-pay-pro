import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createGuestCircuit } from "@/lib/guest.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/guest/new")({
  head: () => ({
    meta: [
      { title: "Créer un circuit sans compte" },
      {
        name: "description",
        content:
          "Lancez un circuit de signature ou de paiement en quelques secondes, sans inscription. Un lien d'accès vous est envoyé par email.",
      },
    ],
  }),
  component: GuestNew,
});

type SignerRow = { name: string; email: string };
type ValidatorRow = { name: string; email: string; required: boolean };

function GuestNew() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [sequential, setSequential] = useState(false);
  const [signers, setSigners] = useState<SignerRow[]>([{ name: "", email: "" }]);
  const [validators, setValidators] = useState<ValidatorRow[]>([]);

  const createFn = useServerFn(createGuestCircuit);
  const m = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          email,
          title,
          description: description || undefined,
          amount_ttc: amount ? Number(amount) : null,
          sequential,
          signers: signers
            .filter((s) => s.name.trim() && s.email.trim())
            .map((s) => ({ name: s.name.trim(), email: s.email.trim() })),
          validators: validators
            .filter((v) => v.name.trim() && v.email.trim())
            .map((v) => ({
              name: v.name.trim(),
              email: v.email.trim(),
              required: v.required,
            })),
        },
      }),
    onSuccess: (res) => {
      toast.success("Circuit créé. Vérifiez votre email.");
      nav({ to: "/guest/$token", params: { token: res.magic_token } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Créer un circuit sans compte</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Renseignez votre email — vous recevrez un lien sécurisé pour suivre et
        modifier votre circuit à tout moment.
      </p>

      <form
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email || !title) return;
          if (signers.every((s) => !s.name.trim() || !s.email.trim())) {
            toast.error("Ajoutez au moins un signataire.");
            return;
          }
          m.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="email">Votre email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="title">Titre du document</Label>
            <Input
              id="title"
              required
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="desc">Description (optionnel)</Label>
          <Textarea
            id="desc"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="max-w-xs">
          <Label htmlFor="amount">Montant TTC (€, optionnel)</Label>
          <Input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Signataires</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSigners((p) => [...p, { name: "", email: "" }])
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Ajouter
            </Button>
          </div>
          {signers.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                placeholder="Nom"
                value={s.name}
                onChange={(e) =>
                  setSigners((p) =>
                    p.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r))
                  )
                }
              />
              <Input
                placeholder="Email"
                type="email"
                value={s.email}
                onChange={(e) =>
                  setSigners((p) =>
                    p.map((r, idx) => (idx === i ? { ...r, email: e.target.value } : r))
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSigners((p) => p.filter((_, idx) => idx !== i))}
                disabled={signers.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sequential}
              onCheckedChange={(v) => setSequential(v === true)}
            />
            Signature dans l'ordre indiqué
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Validateurs (optionnel)</h2>
              <p className="text-xs text-muted-foreground">
                Chaque validateur reçoit un email pour approuver ou rejeter le
                document, dans l'ordre indiqué.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setValidators((p) => [
                  ...p,
                  { name: "", email: "", required: true },
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Ajouter
            </Button>
          </div>
          {validators.map((v, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <Input
                placeholder="Nom"
                value={v.name}
                onChange={(e) =>
                  setValidators((p) =>
                    p.map((r, idx) =>
                      idx === i ? { ...r, name: e.target.value } : r
                    )
                  )
                }
              />
              <Input
                placeholder="Email"
                type="email"
                value={v.email}
                onChange={(e) =>
                  setValidators((p) =>
                    p.map((r, idx) =>
                      idx === i ? { ...r, email: e.target.value } : r
                    )
                  )
                }
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={v.required}
                  onCheckedChange={(c) =>
                    setValidators((p) =>
                      p.map((r, idx) =>
                        idx === i ? { ...r, required: c === true } : r
                      )
                    )
                  }
                />
                Obligatoire
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setValidators((p) => p.filter((_, idx) => idx !== i))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>



        <Button type="submit" disabled={m.isPending} className="w-full sm:w-auto">
          {m.isPending ? "Création…" : "Créer le circuit"}
        </Button>

        <p className="text-xs text-muted-foreground">
          En continuant, vous acceptez que nous vous envoyions un lien
          d'accès à votre espace. Aucune création de compte n'est requise.
        </p>
      </form>
    </div>
  );
}
