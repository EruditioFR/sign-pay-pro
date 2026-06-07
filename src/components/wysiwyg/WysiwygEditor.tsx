import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { FieldPlaceholder, FIELD_KIND_META, type FieldKind } from "./FieldPlaceholderNode";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold, Italic, Underline as ULine, List, ListOrdered,
  Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, Plus,
} from "lucide-react";
import { useEffect } from "react";
import { A4_DIMS } from "./html-to-pdf";

interface Props {
  initialHtml?: string;
  onChange?: (html: string) => void;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
}

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

  const insertField = (kind: FieldKind) => {
    editor.chain().focus().insertContent({
      type: "fieldPlaceholder",
      attrs: { kind, label: FIELD_KIND_META[kind].label },
    }).run();
  };

  return (
    <div className="space-y-3">
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
        <Sep />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="default" className="h-8 gap-1">
              <Plus className="h-4 w-4" /> Insérer un champ
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(Object.keys(FIELD_KIND_META) as FieldKind[]).map((k) => {
              const m = FIELD_KIND_META[k];
              const Icon = m.icon;
              return (
                <DropdownMenuItem key={k} onClick={() => insertField(k)}>
                  <Icon className="mr-2 h-4 w-4" /> {m.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={editorRootRef}
        className="mx-auto"
        style={{ width: `${A4_DIMS.widthMm}mm` }}
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
