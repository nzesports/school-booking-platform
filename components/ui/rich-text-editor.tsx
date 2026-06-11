"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder = "Write rich content..."
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [html, setHtml] = useState(defaultValue);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }
      }),
      Link.configure({
        openOnClick: false,
        autolink: true
      })
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        spellcheck: "true",
        "data-placeholder": placeholder,
        class:
          "rich-text-prose min-h-[260px] rounded-b-[22px] bg-white px-4 py-4 text-sm leading-7 text-[color:var(--text-dark)] outline-none"
      }
    },
    onUpdate({ editor: activeEditor }) {
      setHtml(activeEditor.getHTML());
    }
  });

  return (
    <div className="overflow-hidden rounded-[22px] border border-[color:var(--border-soft)] bg-white/96">
      <input type="hidden" name={name} value={html} />
      <div className="flex flex-wrap gap-2 border-b border-[color:rgba(4,15,75,0.08)] px-4 py-3">
        <ToolbarButton active={Boolean(editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}>
          B
        </ToolbarButton>
        <ToolbarButton active={Boolean(editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          I
        </ToolbarButton>
        <ToolbarButton
          active={Boolean(editor?.isActive("heading", { level: 2 }))}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={Boolean(editor?.isActive("heading", { level: 3 }))}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <ToolbarButton active={Boolean(editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          List
        </ToolbarButton>
        <ToolbarButton active={Boolean(editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          1. List
        </ToolbarButton>
        <ToolbarButton active={Boolean(editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          Quote
        </ToolbarButton>
        <ToolbarButton
          active={Boolean(editor?.isActive("link"))}
          onClick={() => {
            const previousUrl = editor?.getAttributes("link").href as string | undefined;
            const url = window.prompt("Paste a URL", previousUrl ?? "https://");

            if (url === null) {
              return;
            }

            if (!url) {
              editor?.chain().focus().unsetLink().run();
              return;
            }

            editor?.chain().focus().setLink({ href: url }).run();
          }}
        >
          Link
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 min-w-10 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold",
        active
          ? "border-[#95d2ab] bg-[#eaf8ee] text-[#117a2e]"
          : "border-[color:rgba(4,15,75,0.1)] bg-[color:var(--blue-soft)] text-[color:var(--navy)]"
      )}
    >
      {children}
    </button>
  );
}
