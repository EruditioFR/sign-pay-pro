import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyOrganization, updateOrganization } from "@/lib/organization.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrgLogoUploader } from "@/components/org-logo-uploader";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const fetchOrg = useServerFn(getMyOrganization);
  const saveOrg = useServerFn(updateOrganization);
  const { data: org, isLoading } = useQuery({
    queryKey: ["my-organization"],
    queryFn: () => fetchOrg(),
  });

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (org?.name) setName(org.name);
  }, [org?.name]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Le nom est requis.");
      return;
    }
    setSaving(true);
    try {
      await saveOrg({ data: { name: name.trim() } });
      toast.success("Organisation mise à jour.");
      qc.invalidateQueries({ queryKey: ["my-organization"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-organization"] });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Paramètres de l'organisation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Modifiez les informations de votre organisation.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !org ? (
            <p className="text-sm text-muted-foreground">Organisation introuvable.</p>
          ) : (
            <form onSubmit={onSubmit} className="grid max-w-lg gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-name">Nom de l'organisation</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  required
                />
              </div>
              <div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo & identité visuelle</CardTitle>
          <p className="text-sm text-muted-foreground">
            Ce logo apparaît automatiquement dans l'en-tête des documents et PDF générés.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <OrgLogoUploader logoUrl={org?.logo_url ?? null} onChange={refresh} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
