import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createAdminClientAccount,
  listAdminClients,
} from "@/lib/super-admin.functions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/super-admin/admin-clients")({
  component: AdminClientsPage,
});

function AdminClientsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminClients);
  const create = useServerFn(createAdminClientAccount);
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-clients"],
    queryFn: () => list(),
  });

  const [form, setForm] = useState({
    fullName: "",
    organizationName: "",
    email: "",
    phone: "",
    country: "FR",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email && !form.phone) {
      toast.error("Renseignez un email ou un téléphone.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Mot de passe : 8 caractères minimum.");
      return;
    }
    setSubmitting(true);
    try {
      await create({ data: form });
      toast.success("Compte admin client créé.");
      setForm({
        fullName: "",
        organizationName: "",
        email: "",
        phone: "",
        country: "FR",
        password: "",
      });
      qc.invalidateQueries({ queryKey: ["super-admin-clients"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Créer un compte admin client</CardTitle>
          <p className="text-sm text-muted-foreground">
            Identifiant = email ou numéro de téléphone (au moins l'un des deux).
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nom complet</Label>
              <Input
                id="fullName"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org">Nom de l'organisation</Label>
              <Input
                id="org"
                required
                value={form.organizationName}
                onChange={(e) =>
                  setForm({ ...form, organizationName: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email (identifiant)</Label>
              <Input
                id="email"
                type="email"
                placeholder="client@exemple.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone (identifiant)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+33612345678"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Pays</Label>
              <Input
                id="country"
                maxLength={3}
                value={form.country}
                onChange={(e) =>
                  setForm({ ...form, country: e.target.value.toUpperCase() })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe initial</Label>
              <Input
                id="password"
                type="text"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Création…" : "Créer le compte"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comptes admin client</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !data?.accounts.length ? (
            <p className="text-sm text-muted-foreground">Aucun compte.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Identifiant</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.map((a) => (
                  <TableRow key={a.userId}>
                    <TableCell>{a.fullName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.email}
                    </TableCell>
                    <TableCell>{a.organization?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={a.active ? "default" : "outline"}>
                        {a.active ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
