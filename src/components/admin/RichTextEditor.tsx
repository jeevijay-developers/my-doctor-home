import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import FontFamily from "@tiptap/extension-font-family";
import Youtube from "@tiptap/extension-youtube";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Superscript as SupIcon,
  Subscript as SubIcon, Highlighter, Palette, Heading1, Heading2, Heading3, Heading4, Pilcrow,
  List, ListOrdered, ListChecks, IndentIncrease, IndentDecrease, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, Quote, Minus, Code2, Table as TableIcon, Link as LinkIcon,
  Unlink, Image as ImageIcon, Youtube as YoutubeIcon, Undo, Redo, Eraser, Maximize2, Minimize2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

const FONTS = ["Inter", "Plus Jakarta Sans", "Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"];
const SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"];
const COLORS = ["#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#6b7280"];

const ToolbarBtn = ({
  onClick, active, disabled, title, children,
}: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition",
      active && "bg-royal/10 text-royal",
      disabled && "opacity-40 cursor-not-allowed",
    )}
  >
    {children}
  </button>
);

const Divider = () => <div className="w-px h-6 bg-border mx-1" />;

const RichTextEditor = ({ value, onChange, placeholder }: Props) => {
  const [fullscreen, setFullscreen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "text-royal underline" } }),
      Image.configure({ inline: false, HTMLAttributes: { class: "rounded-lg max-w-full" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      Placeholder.configure({ placeholder: placeholder || "Write your article..." }),
      CharacterCount,
      FontFamily,
      Youtube.configure({ inline: false, width: 640, height: 360, HTMLAttributes: { class: "rounded-lg" } }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none focus:outline-none min-h-[400px] px-4 py-3",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextContent = value || "";
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, value]);
  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href;
    const url = window.prompt("URL", previous || "https://");
    if (url === null) return;
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const addYoutube = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("YouTube URL");
    if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  const headingValue = editor.isActive("heading", { level: 1 }) ? "h1"
    : editor.isActive("heading", { level: 2 }) ? "h2"
    : editor.isActive("heading", { level: 3 }) ? "h3"
    : editor.isActive("heading", { level: 4 }) ? "h4"
    : "p";

  return (
    <div className={cn("border border-border rounded-xl bg-card overflow-hidden", fullscreen && "fixed inset-4 z-50 shadow-2xl flex flex-col")}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-secondary/40">
        <ToolbarBtn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo className="h-4 w-4" /></ToolbarBtn>
        <Divider />

        <Select
          value={headingValue}
          onValueChange={(v) => {
            if (v === "p") editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 }).run();
          }}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="p">Paragraph</SelectItem>
            <SelectItem value="h1">Heading 1</SelectItem>
            <SelectItem value="h2">Heading 2</SelectItem>
            <SelectItem value="h3">Heading 3</SelectItem>
            <SelectItem value="h4">Heading 4</SelectItem>
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => editor.chain().focus().setFontFamily(v).run()}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Font" /></SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => editor.chain().focus().setMark("textStyle", { fontSize: v }).run()}>
          <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
          <SelectContent>
            {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Divider />

        <ToolbarBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Superscript" active={editor.isActive("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()}><SupIcon className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Subscript" active={editor.isActive("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()}><SubIcon className="h-4 w-4" /></ToolbarBtn>

        <Divider />

        {/* Text color */}
        <div className="relative group">
          <ToolbarBtn title="Text color" onClick={() => {}}><Palette className="h-4 w-4" /></ToolbarBtn>
          <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-wrap gap-1 p-2 bg-card border border-border rounded-lg shadow-lg z-20 w-[140px]">
            {COLORS.map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setColor(c).run()}
                className="w-6 h-6 rounded border border-border" style={{ background: c }} />
            ))}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().unsetColor().run()}
              className="text-[10px] w-full mt-1 text-muted-foreground hover:text-foreground">Remove</button>
          </div>
        </div>

        {/* Highlight */}
        <div className="relative group">
          <ToolbarBtn title="Highlight" active={editor.isActive("highlight")} onClick={() => {}}><Highlighter className="h-4 w-4" /></ToolbarBtn>
          <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-wrap gap-1 p-2 bg-card border border-border rounded-lg shadow-lg z-20 w-[140px]">
            {["#fef3c7", "#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e9d5ff"].map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
                className="w-6 h-6 rounded border border-border" style={{ background: c }} />
            ))}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().unsetHighlight().run()}
              className="text-[10px] w-full mt-1 text-muted-foreground hover:text-foreground">Remove</button>
          </div>
        </div>

        <ToolbarBtn title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="h-4 w-4" /></ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Task list" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Indent" onClick={() => editor.chain().focus().sinkListItem("listItem").run()}><IndentIncrease className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Outdent" onClick={() => editor.chain().focus().liftListItem("listItem").run()}><IndentDecrease className="h-4 w-4" /></ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className="h-4 w-4" /></ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="h-4 w-4" /></ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Insert link" active={editor.isActive("link")} onClick={setLink}><LinkIcon className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()} disabled={!editor.isActive("link")}><Unlink className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Insert image" onClick={addImage}><ImageIcon className="h-4 w-4" /></ToolbarBtn>
        <ToolbarBtn title="Embed YouTube" onClick={addYoutube}><YoutubeIcon className="h-4 w-4" /></ToolbarBtn>

        <Divider />

        <ToolbarBtn title={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={() => setFullscreen((v) => !v)}>
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </ToolbarBtn>
      </div>

      {/* Table quick controls */}
      {editor.isActive("table") && (
        <div className="flex flex-wrap gap-1 px-2 py-1 border-b border-border bg-secondary/20 text-xs">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().deleteRow().run()}>− Row</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Col</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().deleteColumn().run()}>− Col</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</Button>
        </div>
      )}

      {/* Image align quick controls */}
      {editor.isActive("image") && (
        <div className="flex flex-wrap gap-1 px-2 py-1 border-b border-border bg-secondary/20 text-xs">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().updateAttributes("image", { style: "display:block;margin:0 auto 0 0;max-width:50%" }).run()}>Left</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().updateAttributes("image", { style: "display:block;margin:0 auto;max-width:70%" }).run()}>Center</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().updateAttributes("image", { style: "display:block;margin:0 0 0 auto;max-width:50%" }).run()}>Right</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editor.chain().focus().updateAttributes("image", { style: "display:block;width:100%" }).run()}>Full</Button>
        </div>
      )}

      <div className={cn("overflow-y-auto", fullscreen ? "flex-1" : "max-h-[60vh]")}>
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-secondary/30 text-xs text-muted-foreground">
        <span>{editor.storage.characterCount.words()} words</span>
        <span>{editor.storage.characterCount.characters()} characters</span>
      </div>
    </div>
  );
};

export default RichTextEditor;
