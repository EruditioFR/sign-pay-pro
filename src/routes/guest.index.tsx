import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requestGuestMagicLink } from "@/lib/guest.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/guest/")({
  head: () => ({
    meta: [
      { title: "Espace invité — accéder à mes circuits" },
      {
        name: "description",
        content:
          "Recevez un lien sécurisé par email pour retrouver vos circuits de signature et de paiement créés sans compte.",
      },
    ],
  }),
  component: GuestIndex,
});

function GuestIndex() {
  const [email, setEmail] = useState("");
  const askFn = useServerFn(requestGuestMagicLink);
  const m = useMutation({
    mutationFn: (e: string) => askFn({ data: { email: e } }),
    onSuccess: () =>
      toast.success("Si un espace existe, un lien vient de vous être envoyé."),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Accéder à mon espace invité</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Saisissez l'email que vous avez utilisé en créant votre circuit. Nous
        vous renverrons un lien sécurisé.
      </p>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email) return;
          m.mutate(email);
        }}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={m.isPending} className="w-full">
          {m.isPending ? "Envoi…" : "Recevoir mon lien"}
        </Button>
      </form>

      <div className="mt-8 text-sm text-muted-foreground">
        Pas encore de circuit ?{" "}
        <Link to="/guest/new" className="text-primary underline">
          Créer un circuit sans compte
        </Link>
      </div>
    </div>
  );
}
