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
import { Trash2, Plus, GripVertical } from "lucide-react";

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
      {block.type === "pricing_table" && <PricingTableProps block={block} onUpdate={onUpdate} />}
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
  const headers = block.headers.length
    ? [...block.headers]
    : Array.from({ length: block.columns }, (_, i) => `Col ${i + 1}`);
  const data = Array.from({ length: block.rows }, (_, r) =>
    Array.from({ length: block.columns }, (_, c) => block.data[r]?.[c] ?? ""),
  );

  const updateCols = (cols: number) => {
    const c = Math.max(1, Math.min(12, Math.round(cols)));
    onUpdate(block.id, {
      columns: c,
      headers: Array.from({ length: c }, (_, i) => headers[i] ?? `Col ${i + 1}`),
      data: data.map((row) => Array.from({ length: c }, (_, i) => row[i] ?? "")),
    } as Partial<Block>);
  };
  const updateRows = (rows: number) => {
    const r = Math.max(1, Math.min(60, Math.round(rows)));
    onUpdate(block.id, {
      rows: r,
      data: Array.from({ length: r }, (_, i) =>
        data[i] ?? Array.from({ length: block.columns }, () => ""),
      ),
    } as Partial<Block>);
  };
  const setHeader = (i: number, v: string) => {
    const next = [...headers];
    next[i] = v;
    onUpdate(block.id, { headers: next } as Partial<Block>);
  };
  const setCell = (r: number, c: number, v: string) => {
    const next = data.map((row) => [...row]);
    next[r][c] = v;
    onUpdate(block.id, { data: next } as Partial<Block>);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Colonnes" value={block.columns} onChange={updateCols} />
        <NumberField label="Lignes" value={block.rows} onChange={updateRows} />
      </div>
      <div>
        <Label className="text-xs mb-1 block">Contenu</Label>
        <div className="border rounded-md overflow-hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${block.columns}, minmax(0,1fr))` }}>
            {headers.slice(0, block.columns).map((h, i) => (
              <input
                key={`h-${i}`}
                value={h}
                onChange={(e) => setHeader(i, e.target.value)}
                placeholder={`Col ${i + 1}`}
                className="h-7 text-xs font-medium bg-muted border-b border-r last:border-r-0 px-1.5 outline-none focus:bg-background"
              />
            ))}
            {data.map((row, r) =>
              row.map((cell, c) => (
                <input
                  key={`c-${r}-${c}`}
                  value={cell}
                  onChange={(e) => setCell(r, c, e.target.value)}
                  className="h-7 text-xs border-b border-r last:border-r-0 px-1.5 outline-none focus:bg-accent/40"
                />
              )),
            )}
          </div>
        </div>
      </div>
      <NumberField label="Taille (pt)" value={block.fontSize} onChange={(v) => onUpdate(block.id, { fontSize: v } as Partial<Block>)} />
    </div>
  );
}

function PricingTableProps({
  block,
  onUpdate,
}: {
  block: Extract<Block, { type: "pricing_table" }>;
  onUpdate: (id: string, p: Partial<Block>) => void;
}) {
  const setItems = (items: typeof block.items) => onUpdate(block.id, { items } as Partial<Block>);
  const updateItem = (i: number, patch: Partial<(typeof block.items)[number]>) => {
    const next = block.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    setItems(next);
  };
  const addItem = () =>
    setItems([...block.items, { label: "Nouvelle ligne", qty: 1, unitPriceHt: 0 }]);
  const removeItem = (i: number) => setItems(block.items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= block.items.length) return;
    const next = [...block.items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs">Lignes du devis</Label>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
          </Button>
        </div>
        <div className="space-y-1.5">
          {block.items.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Aucune ligne. Ajoutez votre première prestation.</p>
          )}
          {block.items.map((it, i) => (
            <div key={i} className="rounded-md border bg-background p-2 space-y-1.5">
              <div className="flex items-start gap-1">
                <button
                  type="button"
                  className="flex flex-col mt-0.5 text-muted-foreground hover:text-foreground"
                  title="Réorganiser"
                >
                  <GripVertical className="h-3 w-3" />
                </button>
                <Textarea
                  rows={2}
                  value={it.label}
                  onChange={(e) => updateItem(i, { label: e.target.value })}
                  placeholder="Désignation"
                  className="text-xs min-h-[44px]"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-destructive"
                  onClick={() => removeItem(i)}
                  title="Supprimer la ligne"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Qté</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-7 text-xs"
                    value={it.qty}
                    onChange={(e) => updateItem(i, { qty: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">PU HT</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-7 text-xs"
                    value={it.unitPriceHt}
                    onChange={(e) => updateItem(i, { unitPriceHt: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
                <div className="flex gap-1">
                  <button type="button" className="hover:text-foreground" onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="hover:text-foreground" onClick={() => move(i, 1)}>↓</button>
                </div>
                <span>
                  Total HT&nbsp;:&nbsp;
                  {(Math.round(it.qty * it.unitPriceHt * 100) / 100).toLocaleString("fr-FR", {
                    style: "currency",
                    currency: block.currency,
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t pt-2">
        <div>
          <Label className="text-xs">TVA (%)</Label>
          <Input
            type="number"
            step="0.1"
            className="h-8"
            value={block.vatRate}
            onChange={(e) => onUpdate(block.id, { vatRate: Number(e.target.value) || 0 } as Partial<Block>)}
          />
        </div>
        <div>
          <Label className="text-xs">Devise</Label>
          <Select
            value={block.currency}
            onValueChange={(v) => onUpdate(block.id, { currency: v } as Partial<Block>)}
          >
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR €</SelectItem>
              <SelectItem value="USD">USD $</SelectItem>
              <SelectItem value="GBP">GBP £</SelectItem>
              <SelectItem value="CHF">CHF</SelectItem>
              <SelectItem value="CAD">CAD $</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <NumberField label="Taille (pt)" value={block.fontSize} onChange={(v) => onUpdate(block.id, { fontSize: v } as Partial<Block>)} />
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
