"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Deliverability guardrail shared with the server-side sanitizer: emails wider
// than ~560px clip in Gmail/Outlook, so inserted images are capped.
const MAX_IMAGE_WIDTH = 560;

// Links need inline styles + target preserved so "button" links survive both
// the TipTap schema and the email sanitizer.
const EmailLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null
      },
      target: {
        default: "_blank"
      }
    };
  }
}).configure({
  openOnClick: false,
  autolink: true
});

const EmailImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null
      },
      style: {
        default: null
      }
    };
  }
});

export function EmailEditor({
  name,
  defaultValue = "",
  placeholders = []
}: {
  name: string;
  defaultValue?: string;
  placeholders?: string[];
}) {
  const [html, setHtml] = useState(defaultValue);
  const [accentColor, setAccentColor] = useState("#18a83b");
  const colorInputRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false
      }),
      EmailLink,
      TextStyle,
      Color,
      EmailImage
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        spellcheck: "true",
        class:
          "rich-text-prose min-h-[220px] rounded-b-[18px] bg-white px-4 py-4 text-sm leading-7 text-[color:var(--text-dark)] outline-none"
      }
    },
    onUpdate({ editor: activeEditor }) {
      setHtml(activeEditor.getHTML());
    }
  });

  const insertButton = () => {
    if (!editor) {
      return;
    }

    const label = window.prompt("Button text", "Open the booking platform");

    if (!label) {
      return;
    }

    const url = window.prompt("Button link (https:// or a {{placeholder}})", "https://");

    if (!url) {
      return;
    }

    const style = `display:inline-block;background-color:${accentColor};color:#ffffff;padding:12px 26px;border-radius:10px;font-weight:bold;text-decoration:none;`;
    editor
      .chain()
      .focus()
      .insertContent(
        `<p><a href="${url}" target="_blank" rel="noopener noreferrer" style="${style}">${label}</a></p>`
      )
      .run();
  };

  const insertImage = () => {
    if (!editor) {
      return;
    }

    const src = window.prompt(
      "Image URL (must be hosted, starting with https:// — attachments and pasted images get blocked by email clients)",
      "https://"
    );

    if (!src || !src.startsWith("https://")) {
      if (src) {
        window.alert("Images must use an https:// URL so email clients will load them.");
      }

      return;
    }

    const alt = window.prompt("Describe the image (alt text — required for accessibility)", "") ?? "";
    const widthInput = window.prompt(`Width in pixels (max ${MAX_IMAGE_WIDTH})`, "400");
    const width = Math.min(
      Math.max(Number.parseInt(widthInput ?? "400", 10) || 400, 40),
      MAX_IMAGE_WIDTH
    );

    editor
      .chain()
      .focus()
      .insertContent(
        `<img src="${src}" alt="${alt}" width="${width}" style="max-width:100%;height:auto;width:${width}px;" />`
      )
      .run();
  };

  const insertPlaceholder = (placeholder: string) => {
    editor?.chain().focus().insertContent(`{{${placeholder}}}`).run();
  };

  const setLink = () => {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Paste a URL (opens in a new tab)", previousUrl ?? "https://");

    if (url === null) {
      return;
    }

    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white/96">
      <input type="hidden" name={name} value={html} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:rgba(4,15,75,0.08)] px-3 py-2">
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
        <ToolbarButton active={Boolean(editor?.isActive("link"))} onClick={setLink}>
          Link
        </ToolbarButton>

        <span aria-hidden className="mx-1 h-6 w-px bg-[rgba(4,15,75,0.1)]" />

        {/* Colour picker: applies to selected text, and sets the fill for new buttons. */}
        <button
          type="button"
          title="Pick a colour (applies to selected text and new buttons)"
          onClick={() => colorInputRef.current?.click()}
          className="relative inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:rgba(4,15,75,0.1)] bg-[color:var(--blue-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]"
        >
          <span
            className="h-3.5 w-3.5 rounded-full border border-[rgba(4,15,75,0.15)]"
            style={{ backgroundColor: accentColor }}
          />
          Colour
          <input
            ref={colorInputRef}
            type="color"
            value={accentColor}
            onChange={(event) => {
              setAccentColor(event.target.value);

              if (!editor?.state.selection.empty) {
                editor?.chain().focus().setColor(event.target.value).run();
              }
            }}
            className="absolute h-0 w-0 opacity-0"
            aria-label="Pick a colour"
          />
        </button>
        <ToolbarButton active={false} onClick={insertButton}>
          + Button
        </ToolbarButton>
        <ToolbarButton active={false} onClick={insertImage}>
          + Image
        </ToolbarButton>

        {placeholders.length > 0 ? (
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) {
                insertPlaceholder(event.target.value);
              }
            }}
            className="min-h-9 rounded-full border border-[color:rgba(4,15,75,0.1)] bg-[color:var(--blue-soft)] px-3 text-xs font-semibold text-[color:var(--navy)] outline-none"
            aria-label="Insert placeholder"
          >
            <option value="">Insert placeholder…</option>
            {placeholders.map((placeholder) => (
              <option key={placeholder} value={placeholder}>
                {`{{${placeholder}}}`}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <EditorContent editor={editor} />

      {placeholders.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:rgba(4,15,75,0.08)] px-3 py-2.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-soft)]">
            Available placeholders
          </span>
          {placeholders.map((placeholder) => (
            <button
              key={placeholder}
              type="button"
              onClick={() => insertPlaceholder(placeholder)}
              className="rounded-full border border-[color:rgba(4,15,75,0.1)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[color:var(--navy)] transition hover:border-[rgba(24,168,59,0.4)] hover:text-[#117a2e]"
            >
              {`{{${placeholder}}}`}
            </button>
          ))}
        </div>
      ) : null}
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
        "inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border px-2.5 py-1.5 text-xs font-semibold",
        active
          ? "border-[#95d2ab] bg-[#eaf8ee] text-[#117a2e]"
          : "border-[color:rgba(4,15,75,0.1)] bg-[color:var(--blue-soft)] text-[color:var(--navy)]"
      )}
    >
      {children}
    </button>
  );
}
