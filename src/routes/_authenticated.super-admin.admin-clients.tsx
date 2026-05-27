import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createAdminClientAccount,
  listAdminClients,
  updateAdminClientAccount,
  deleteAdminClientAccount,
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

type Account = {
  userId: string;
  email: string | null;
  fullName: string | null;
  active: boolean;
  organization: { id: string; name: string; country: string; plan: string; active: boolean } | null;
};

function AdminClientsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminClients);
  const create = useServerFn(createAdminClientAccount);
  const update = useServerFn(updateAdminClientAccount);
  const remove = useServerFn(deleteAdminClientAccount);
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
  const [editing, setEditing] = useState<Account | null>(null);

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

  const onDelete = async (a: Account) => {
    if (!confirm(`Supprimer définitivement ${a.email} ?`)) return;
    try {
      await remove({ data: { userId: a.userId } });
      toast.success("Compte supprimé.");
      qc.invalidateQueries({ queryKey: ["super-admin-clients"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
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
              <Input id="fullName" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org">Nom de l'organisation</Label>
              <Input id="org" required value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email (identifiant)</Label>
              <Input id="email" type="email" placeholder="client@exemple.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone (identifiant)</Label>
              <Input id="phone" type="tel" placeholder="+33612345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Pays</Label>
              <Input id="country" maxLength={3} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe initial</Label>
              <Input id="password" type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.map((a) => (
                  <TableRow key={a.userId}>
                    <TableCell>{a.fullName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.email}</TableCell>
                    <TableCell>{a.organization?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={a.active ? "default" : "outline"}>
                        {a.active ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(a as Account)}>
                        Éditer
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onDelete(a as Account)}>
                        Supprimer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditDialog
        account={editing}
        onClose={() => setEditing(null)}
        onSave={async (payload) => {
          try {
            await update({ data: payload });
            toast.success("Compte mis à jour.");
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["super-admin-clients"] });
            qc.invalidateQueries({ queryKey: ["tenants"] });
          } catch (err: any) {
            toast.error(err?.message ?? "Erreur lors de la mise à jour.");
          }
        }}
      />
    </div>
  );
}

function EditDialog({
  account,
  onClose,
  onSave,
}: {
  account: Account | null;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}) {
  const [state, setState] = useState({
    fullName: "",
    email: "",
    organizationName: "",
    country: "FR",
    password: "",
    active: true,
  });
  const [saving, setSaving] = useState(false);

  // initialize on open
  const open = !!account;
  if (account && state.email !== (account.email ?? "") && state.fullName !== (account.fullName ?? "")) {
    // no-op guard: handled by effect-like pattern below
  }

  // Sync when account changes
  useSyncAccount(account, setState);

  if (!account) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        userId: account.userId,
        fullName: state.fullName,
        email: state.email,
        organizationName: state.organizationName,
        country: state.country,
        active: state.active,
        password: state.password || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Éditer le compte admin client</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Nom complet</Label>
            <Input value={state.fullName} onChange={(e) => setState({ ...state, fullName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Organisation</Label>
              <Input value={state.organizationName} onChange={(e) => setState({ ...state, organizationName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Pays</Label>
              <Input maxLength={3} value={state.country} onChange={(e) => setState({ ...state, country: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nouveau mot de passe (optionnel)</Label>
            <Input type="text" placeholder="Laisser vide pour conserver" value={state.password} onChange={(e) => setState({ ...state, password: e.target.value })} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Compte actif</p>
              <p className="text-xs text-muted-foreground">Désactiver bloque la connexion.</p>
            </div>
            <Switch checked={state.active} onCheckedChange={(v) => setState({ ...state, active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect } from "react";
function useSyncAccount(account: Account | null, setState: (s: any) => void) {
  useEffect(() => {
    if (account) {
      setState({
        fullName: account.fullName ?? "",
        email: account.email ?? "",
        organizationName: account.organization?.name ?? "",
        country: account.organization?.country ?? "FR",
        password: "",
        active: account.active,
      });
    }
  }, [account?.userId]);
}
