import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Type, CalendarDays, CheckSquare, PenLine, Signature, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export type FieldKind = "text" | "date" | "checkbox" | "signature" | "initials";

const KIND_META: Record<
  FieldKind,
  { label: string; icon: typeof Type; width: number; height: number }
> = {
  text: { label: "Texte", icon: Type, width: 160, height: 24 },
  date: { label: "Date", icon: CalendarDays, width: 110, height: 24 },
  checkbox: { label: "Case", icon: CheckSquare, width: 22, height: 22 },
  signature: { label: "Signature", icon: PenLine, width: 180, height: 60 },
  initials: { label: "Paraphe", icon: Signature, width: 60, height: 40 },
};

function FieldView(props: NodeViewProps) {
  const kind = (props.node.attrs.kind as FieldKind) ?? "text";
  const label = (props.node.attrs.label as string) || KIND_META[kind].label;
  const required = Boolean(props.node.attrs.required);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftRequired, setDraftRequired] = useState(required);

  return (
    <NodeViewWrapper
      as="span"
      className="field-placeholder"
      data-field-kind={kind}
      data-field-label={label}
      data-field-required={required ? 1 : 0}
      contentEditable={false}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) { setDraftLabel(label); setDraftRequired(required); } }}>
        <PopoverTrigger asChild>
          <span
            data-drag-handle
            draggable="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              margin: "0 2px",
              borderRadius: "4px",
              background: required ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)",
              border: `1px dashed ${required ? "rgb(34,197,94)" : "rgb(59,130,246)"}`,
              color: required ? "rgb(21,128,61)" : "rgb(37,99,235)",
              fontSize: "12px",
              fontWeight: 500,
              minWidth: `${meta.width}px`,
              minHeight: `${meta.height}px`,
              cursor: "grab",
            }}
          >
            <Icon size={12} />
            <span>{label}{required ? " *" : ""}</span>
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-64 space-y-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {meta.label}
            </p>
            <Label htmlFor="field-label" className="text-xs">Libellé</Label>
            <Input
              id="field-label"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  props.updateAttributes({ label: draftLabel, required: draftRequired });
                  setOpen(false);
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-2">
            <div className="space-y-0.5 pr-2">
              <Label className="text-xs">Modifiable par l'utilisateur</Label>
              <p className="text-[10px] leading-tight text-muted-foreground">
                Le destinataire pourra remplir / signer.
              </p>
            </div>
            <Switch checked={draftRequired} onCheckedChange={setDraftRequired} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => { props.deleteNode(); setOpen(false); }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                props.updateAttributes({ label: draftLabel, required: draftRequired });
                setOpen(false);
              }}
            >
              Valider
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

export const FieldPlaceholder = Node.create({
  name: "fieldPlaceholder",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      kind: { default: "text" },
      label: { default: null },
      required: { default: false, parseHTML: (el) => el.getAttribute("data-field-required") === "1" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-field-kind]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const required = HTMLAttributes.required ? 1 : 0;
    const { required: _r, ...rest } = HTMLAttributes;
    return [
      "span",
      mergeAttributes(rest, {
        "data-field-kind": HTMLAttributes.kind ?? "text",
        "data-field-required": required,
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FieldView);
  },
});

export const FIELD_KIND_META = KIND_META;
