import type { Block, Canvas } from "@/lib/template-canvas/schema";
import { VARIABLE_CATALOG } from "@/lib/template-canvas/variables";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

export interface PropertiesPanelProps {
  canvas: Canvas;
  block: Block | null;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onDelete: (id: string) => void;
  onPageChange: (patch: Partial<Canvas["page"]>) => void;
}

export function PropertiesPanel({
  canvas,
  block,
  onUpdate,
  onDelete,
  onPageChange,
}: PropertiesPanelProps) {
  return (
    <aside className="w-72 shrink-0 border-l bg-card overflow-y-auto">
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Page</h3>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Format</Label>
              <Select
                value={canvas.page.format}
                onValueChange={(v) => onPageChange({ format: v as Canvas["page"]["format"] })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="A5">A5</SelectItem>
                  <SelectItem value="LETTER">Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Orientation</Label>
              <Select
                value={canvas.page.orientation}
                onValueChange={(v) => onPageChange({ orientation: v as Canvas["page"]["orientation"] })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Paysage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Marge (mm)</Label>
              <Input
                type="number"
                className="h-8"
                value={canvas.page.margin}
                onChange={(e) => onPageChange({ margin: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-2">Bloc sélectionné</h3>
          {!block ? (
            <p className="text-xs text-muted-foreground">Sélectionnez un bloc pour modifier ses propriétés.</p>
          ) : (
            <BlockProps block={block} onUpdate={onUpdate} onDelete={onDelete} />
          )}
        </div>
      </div>
    </aside>
  );
}

function BlockProps({
  block,
  onUpdate,
  onDelete,
}: {
  block: Block;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X (mm)" value={block.x} onChange={(v) => onUpdate(block.id, { x: v } as Partial<Block>)} />
        <NumberField label="Y (mm)" value={block.y} onChange={(v) => onUpdate(block.id, { y: v } as Partial<Block>)} />
        <NumberField label="L (mm)" value={block.width} onChange={(v) => onUpdate(block.id, { width: v } as Partial<Block>)} />
        <NumberField label="H (mm)" value={block.height} onChange={(v) => onUpdate(block.id, { height: v } as Partial<Block>)} />
      </div>

      {block.type === "text" && <TextProps block={block} onUpdate={onUpdate} />}
      {block.type === "image" && <ImageProps block={block} onUpdate={onUpdate} />}
      {block.type === "table" && <TableProps block={block} onUpdate={onUpdate} />}
      {block.type === "dynamic" && <DynamicProps block={block} onUpdate={onUpdate} />}
      {block.type === "user_zone" && <UserZoneProps block={block} onUpdate={onUpdate} />}

      <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(block.id)}>
        <Trash2 className="h-4 w-4 mr-1.5" /> Supprimer
      </Button>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        className="h-8"
        value={Math.round(value * 10) / 10}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function TextProps({ block, onUpdate }: { block: Extract<Block, { type: "text" }>; onUpdate: (id: string, p: Partial<Block>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">Contenu</Label>
        <Textarea
          rows={4}
          value={block.text}
          onChange={(e) => onUpdate(block.id, { text: e.target.value } as Partial<Block>)}
        />
      </div>
      <NumberField label="Taille (pt)" value={block.fontSize} onChange={(v) => onUpdate(block.id, { fontSize: v } as Partial<Block>)} />
      <div className="flex gap-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={!!block.bold} onCheckedChange={(v) => onUpdate(block.id, { bold: v } as Partial<Block>)} />
          Gras
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={!!block.italic} onCheckedChange={(v) => onUpdate(block.id, { italic: v } as Partial<Block>)} />
          Italique
        </label>
      </div>
      <div>
        <Label className="text-xs">Alignement</Label>
        <Select value={block.align ?? "left"} onValueChange={(v) => onUpdate(block.id, { align: v as "left" } as Partial<Block>)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Gauche</SelectItem>
            <SelectItem value="center">Centré</SelectItem>
            <SelectItem value="right">Droite</SelectItem>
            <SelectItem value="justify">Justifié</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ImageProps({ block, onUpdate }: { block: Extract<Block, { type: "image" }>; onUpdate: (id: string, p: Partial<Block>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">URL ou data URL</Label>
        <Input
          value={block.src}
          onChange={(e) => onUpdate(block.id, { src: e.target.value } as Partial<Block>)}
          placeholder="https://..."
        />
      </div>
      <div>
        <Label className="text-xs">Importer un fichier</Label>
        <Input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.readAsDataURL(f);
            });
            onUpdate(block.id, { src: dataUrl } as Partial<Block>);
          }}
        />
      </div>
      <div>
        <Label className="text-xs">Ajustement</Label>
        <Select value={block.fit ?? "contain"} onValueChange={(v) => onUpdate(block.id, { fit: v as "contain" } as Partial<Block>)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="contain">Contain</SelectItem>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="fill">Fill</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function TableProps({ block, onUpdate }: { block: Extract<Block, { type: "table" }>; onUpdate: (id: string, p: Partial<Block>) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Colonnes" value={block.columns} onChange={(v) => onUpdate(block.id, { columns: Math.max(1, Math.round(v)) } as Partial<Block>)} />
        <NumberField label="Lignes" value={block.rows} onChange={(v) => onUpdate(block.id, { rows: Math.max(1, Math.round(v)) } as Partial<Block>)} />
      </div>
      <div>
        <Label className="text-xs">En-têtes (séparés par ,)</Label>
        <Input
          value={block.headers.join(",")}
          onChange={(e) => onUpdate(block.id, { headers: e.target.value.split(",").map((s) => s.trim()) } as Partial<Block>)}
        />
      </div>
    </div>
  );
}

function DynamicProps({ block, onUpdate }: { block: Extract<Block, { type: "dynamic" }>; onUpdate: (id: string, p: Partial<Block>) => void }) {
  const groups = Array.from(new Set(VARIABLE_CATALOG.map((v) => v.group)));
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">Variable</Label>
        <Select value={block.variableKey} onValueChange={(v) => onUpdate(block.id, { variableKey: v } as Partial<Block>)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectGroup key={g}>
                <SelectLabel>{g}</SelectLabel>
                {VARIABLE_CATALOG.filter((v) => v.group === g).map((v) => (
                  <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <NumberField label="Taille (pt)" value={block.fontSize} onChange={(v) => onUpdate(block.id, { fontSize: v } as Partial<Block>)} />
      <div>
        <Label className="text-xs">Valeur par défaut</Label>
        <Input
          value={block.fallback ?? ""}
          onChange={(e) => onUpdate(block.id, { fallback: e.target.value } as Partial<Block>)}
        />
      </div>
    </div>
  );
}

function UserZoneProps({ block, onUpdate }: { block: Extract<Block, { type: "user_zone" }>; onUpdate: (id: string, p: Partial<Block>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">Type</Label>
        <Select value={block.zoneKind} onValueChange={(v) => onUpdate(block.id, { zoneKind: v as "signature" } as Partial<Block>)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text_input">Saisie libre</SelectItem>
            <SelectItem value="signature">Signature</SelectItem>
            <SelectItem value="signature_date">Date de signature</SelectItem>
            <SelectItem value="initials">Paraphe</SelectItem>
            <SelectItem value="checkbox">Case à cocher</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Libellé</Label>
        <Input value={block.label} onChange={(e) => onUpdate(block.id, { label: e.target.value } as Partial<Block>)} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Switch checked={!!block.required} onCheckedChange={(v) => onUpdate(block.id, { required: v } as Partial<Block>)} />
        Obligatoire
      </label>
      <div>
        <Label className="text-xs">Rôle assigné</Label>
        <Input
          value={block.assignedRole ?? ""}
          onChange={(e) => onUpdate(block.id, { assignedRole: e.target.value } as Partial<Block>)}
          placeholder="recipient"
        />
      </div>
    </div>
  );
}
