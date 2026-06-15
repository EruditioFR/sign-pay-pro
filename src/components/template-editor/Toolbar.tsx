import { Button } from "@/components/ui/button";
import {
  Type,
  Image as ImageIcon,
  Table as TableIcon,
  Tag,
  PenLine,
  Eye,
  Save,
  Building2,
} from "lucide-react";
import type { Block } from "@/lib/template-canvas/schema";

export interface ToolbarProps {
  onAdd: (kind: Block["type"], preset?: "org_logo") => void;
  onSave: () => void;
  onPreview: () => void;
  saving?: boolean;
}

export function Toolbar({ onAdd, onSave, onPreview, saving }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-background/80 backdrop-blur px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground mr-1">Insérer</span>
      <Button size="sm" variant="outline" onClick={() => onAdd("text")}>
        <Type className="h-4 w-4 mr-1.5" /> Texte
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd("image")}>
        <ImageIcon className="h-4 w-4 mr-1.5" /> Image
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd("image", "org_logo")}>
        <Building2 className="h-4 w-4 mr-1.5" /> Logo organisation
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd("table")}>
        <TableIcon className="h-4 w-4 mr-1.5" /> Tableau
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd("dynamic")}>
        <Tag className="h-4 w-4 mr-1.5" /> Champ dynamique
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd("user_zone")}>
        <PenLine className="h-4 w-4 mr-1.5" /> Zone utilisateur
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onPreview}>
          <Eye className="h-4 w-4 mr-1.5" /> Aperçu
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" /> {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
