import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Type, CalendarDays, CheckSquare, PenLine, Signature } from "lucide-react";

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
  const meta = KIND_META[kind];
  const Icon = meta.icon;

  return (
    <NodeViewWrapper
      as="span"
      className="field-placeholder"
      data-field-kind={kind}
      data-field-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        margin: "0 2px",
        borderRadius: "4px",
        background: "rgba(59,130,246,0.12)",
        border: "1px dashed rgb(59,130,246)",
        color: "rgb(37,99,235)",
        fontSize: "12px",
        fontWeight: 500,
        verticalAlign: "middle",
        minWidth: `${meta.width}px`,
        minHeight: `${meta.height}px`,
        cursor: "pointer",
      }}
      contentEditable={false}
      onClick={() => {
        const next = window.prompt("Libellé du champ", label);
        if (next != null) props.updateAttributes({ label: next });
      }}
    >
      <Icon size={12} />
      <span>{label}</span>
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
    };
  },
  parseHTML() {
    return [{ tag: "span[data-field-kind]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-field-kind": HTMLAttributes.kind ?? "text" }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FieldView);
  },
});

export const FIELD_KIND_META = KIND_META;
