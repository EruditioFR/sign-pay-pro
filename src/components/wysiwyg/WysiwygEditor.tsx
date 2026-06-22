import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { FieldPlaceholder, FIELD_KIND_META, type FieldKind } from "./FieldPlaceholderNode";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline as ULine, List, ListOrdered,
  Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, GripVertical,
} from "lucide-react";
import { useEffect } from "react";
import { A4_DIMS } from "./html-to-pdf";

interface Props {
  initialHtml?: string;
  onChange?: (html: string) => void;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
}

const DND_MIME = "application/x-wysiwyg-field-kind";

export function WysiwygEditor({ initialHtml, onChange, editorRootRef }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Commencez à rédiger votre document…" }),
      FieldPlaceholder,
    ],
    content: initialHtml || "<p></p>",
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && initialHtml && editor.getHTML() === "<p></p>") {
      editor.commands.setContent(initialHtml);
    }
  }, [editor, initialHtml]);

  if (!editor) return <div className="text-sm text-muted-foreground">Chargement de l'éditeur…</div>;

  const insertFieldAtCoords = (kind: FieldKind, clientX: number, clientY: number) => {
    const pos = editor.view.posAtCoords({ left: clientX, top: clientY });
    const chain = editor.chain().focus();
    if (pos) chain.setTextSelection(pos.pos);
    chain.insertContent({
      type: "fieldPlaceholder",
      attrs: { kind, label: FIELD_KIND_META[kind].label },
    }).run();
  };

  const handleDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData(DND_MIME) as FieldKind | "";
    if (!kind) return;
    e.preventDefault();
    insertFieldAtCoords(kind, e.clientX, e.clientY);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
      {/* Palette latérale (drag source) */}
      <aside className="space-y-2">
        <div className="rounded-md border border-border bg-card p-2">
          <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
            Glissez sur le document
          </p>
          <div className="space-y-1">
            {(Object.keys(FIELD_KIND_META) as FieldKind[]).map((k) => {
              const m = FIELD_KIND_META[k];
              const Icon = m.icon;
              return (
                <button
                  key={k}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, k);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => insertFieldAtCoords(k, 0, 0)}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-left text-sm hover:bg-accent cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <Icon className="h-4 w-4" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="space-y-3 min-w-0">
        {/* Barre de mise en forme */}
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-2 sticky top-0 z-10">
          <ToolBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolBtn>
          <Sep />
          <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><ULine className="h-4 w-4" /></ToolBtn>
          <Sep />
          <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolBtn>
          <Sep />
          <ToolBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></ToolBtn>
        </div>

        <div
          ref={editorRootRef}
          className="mx-auto"
          style={{ width: `${A4_DIMS.widthMm}mm` }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DND_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={handleDrop}
        >
          <div
            data-pdf-page
            className="bg-white text-black shadow-md mx-auto"
            style={{
              width: `${A4_DIMS.widthMm}mm`,
              minHeight: `${A4_DIMS.heightMm}mm`,
              padding: `${A4_DIMS.paddingMm}mm`,
              boxSizing: "border-box",
            }}
          >
            <EditorContent
              editor={editor}
              className="prose prose-sm max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[240mm]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  active, onClick, children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className="h-8 w-8 p-0"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Sep() {
  return <span className="mx-1 h-6 w-px bg-border" />;
}
