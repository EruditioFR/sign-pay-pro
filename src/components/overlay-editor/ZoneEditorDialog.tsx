import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { VARIABLE_CATALOG } from "@/lib/template-canvas/variables";
import { ZONE_TYPES, FILLED_BY, type OverlayZone, type ZoneType } from "@/lib/template-overlay/schema";

const TYPE_LABELS: Record<ZoneType, string> = {
  database_field: "Champ BDD",
  user_input: "Saisie libre",
  signature: "Signature",
  initials: "Paraphe",
  date: "Date",
  checkbox: "Case à cocher",
};

interface Props {
  open: boolean;
  zone: OverlayZone | null;
  onClose: () => void;
  onSave: (z: OverlayZone) => void;
  onDelete?: (id: string) => void;
}

export function ZoneEditorDialog({ open, zone, onClose, onSave, onDelete }: Props) {
  const [local, setLocal] = useState<OverlayZone | null>(zone);

  // Sync when zone changes
  if (zone && local?.id !== zone.id) setLocal(zone);

  if (!local) return null;

  function patch<K extends keyof OverlayZone>(k: K, v: OverlayZone[K]) {
    setLocal((p) => (p ? { ...p, [k]: v } : p));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurer la zone</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nom du champ</Label>
            <Input
              value={local.name}
              onChange={(e) => patch("name", e.target.value)}
              placeholder="Ex: Nom du client"
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select value={local.type} onValueChange={(v) => patch("type", v as ZoneType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ZONE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {local.type === "database_field" && (
            <div>
              <Label>Variable BDD</Label>
              <Select value={local.dataKey ?? ""} onValueChange={(v) => patch("dataKey", v)}>
                <SelectTrigger><SelectValue placeholder="Choisir une variable" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {VARIABLE_CATALOG.map((v) => (
                    <SelectItem key={v.key} value={v.key}>
                      {v.group} — {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Rempli par</Label>
            <Select
              value={local.filledBy ?? "admin"}
              onValueChange={(v) => patch("filledBy", v as OverlayZone["filledBy"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILLED_BY.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f === "admin" ? "Administrateur" : f === "signer" ? "Signataire" : "Auto / système"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(local.type === "signature" || local.type === "initials" || local.filledBy === "signer") && (
            <div>
              <Label>Rôle du signataire</Label>
              <Input
                value={local.signerRole ?? ""}
                onChange={(e) => patch("signerRole", e.target.value)}
                placeholder="Ex: locataire"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="required"
              checked={!!local.required}
              onCheckedChange={(c) => patch("required", !!c)}
            />
            <Label htmlFor="required" className="cursor-pointer">Champ obligatoire</Label>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          {onDelete && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => onDelete(local.id)}
            >
              Supprimer
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => onSave(local)}>Enregistrer</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
