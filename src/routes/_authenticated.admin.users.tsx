import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listOrgUsers } from "@/lib/auth.functions";
import { createOrgUser, updateOrgUser, deleteOrgUser } from "@/lib/org-users.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/confirm-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

type OrgRole = "admin_client" | "manager" | "user";

type OrgUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  active: boolean;
  roles: string[];
};

function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(listOrgUsers);
  const create = useServerFn(createOrgUser);
  const update = useServerFn(updateOrgUser);
  const remove = useServerFn(deleteOrgUser);
  const { data, isLoading } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => list({ data: {} }),
  });

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "user" as OrgRole,
  });
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<OrgUser | null>(null);

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
      toast.success("Utilisateur créé.");
      setForm({ fullName: "", email: "", phone: "", password: "", role: "user" });
      qc.invalidateQueries({ queryKey: ["org-users"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (u: OrgUser) => {
    try {
      await remove({ data: { userId: u.id } });
      toast.success("Utilisateur supprimé.");
      qc.invalidateQueries({ queryKey: ["org-users"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Créer un utilisateur</CardTitle>
          <p className="text-sm text-muted-foreground">
            L'utilisateur sera ajouté à votre organisation.
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
              <Label htmlFor="role">Rôle</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as OrgRole })}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Utilisateur</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin_client">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@exemple.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+33612345678"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
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
                {submitting ? "Création…" : "Créer l'utilisateur"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("users.subtitle")}</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : !data?.users.length ? (
            <p className="text-sm text-muted-foreground">{t("users.no_users")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("users.name")}</TableHead>
                  <TableHead>{t("users.email")}</TableHead>
                  <TableHead>{t("users.role")}</TableHead>
                  <TableHead>{t("users.status")}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.fullName ?? "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {u.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="mr-1">
                          {t(`roles.${r}`)}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? "default" : "outline"}>
                        {u.active ? t("users.active") : t("users.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(u as OrgUser)}>
                        Éditer
                      </Button>
                      <ConfirmAction
                        title="Supprimer cet utilisateur ?"
                        description={`${u.email} sera définitivement supprimé. Cette action est irréversible.`}
                        confirmLabel="Supprimer"
                        onConfirm={() => onDelete(u as OrgUser)}
                      >
                        <Button size="sm" variant="destructive">
                          Supprimer
                        </Button>
                      </ConfirmAction>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSave={async (payload) => {
          try {
            await update({ data: payload });
            toast.success("Utilisateur mis à jour.");
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["org-users"] });
          } catch (err: any) {
            toast.error(err?.message ?? "Erreur lors de la mise à jour.");
          }
        }}
      />
    </div>
  );
}

function EditDialog({
  user,
  onClose,
  onSave,
}: {
  user: OrgUser | null;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}) {
  const [state, setState] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "user" as OrgRole,
    active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const primary = (user.roles.find((r) =>
        ["admin_client", "manager", "user"].includes(r),
      ) ?? "user") as OrgRole;
      setState({
        fullName: user.fullName ?? "",
        email: user.email ?? "",
        phone: "",
        password: "",
        role: primary,
        active: user.active,
      });
    }
  }, [user?.id]);

  if (!user) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        userId: user.id,
        fullName: state.fullName,
        email: state.email,
        phone: state.phone || undefined,
        password: state.password || undefined,
        role: state.role,
        active: state.active,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Éditer l'utilisateur</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Nom complet</Label>
            <Input
              value={state.fullName}
              onChange={(e) => setState({ ...state, fullName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={state.email}
                onChange={(e) => setState({ ...state, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input
                type="tel"
                placeholder="+33…"
                value={state.phone}
                onChange={(e) => setState({ ...state, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select
              value={state.role}
              onValueChange={(v) => setState({ ...state, role: v as OrgRole })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Utilisateur</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin_client">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nouveau mot de passe (optionnel)</Label>
            <Input
              type="text"
              placeholder="Laisser vide pour conserver"
              value={state.password}
              onChange={(e) => setState({ ...state, password: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Compte actif</p>
              <p className="text-xs text-muted-foreground">Désactiver bloque la connexion.</p>
            </div>
            <Switch
              checked={state.active}
              onCheckedChange={(v) => setState({ ...state, active: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
