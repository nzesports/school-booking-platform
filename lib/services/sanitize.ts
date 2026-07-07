import sanitizeHtml from "sanitize-html";

// Email bodies allow a little more than site rich text (inline styles for
// buttons/colours, hosted images) while enforcing deliverability guardrails:
// https-only image sources, image widths capped at 560px, and a whitelist of
// inline styles email clients render reliably.
const EMAIL_MAX_IMAGE_WIDTH = 560;

const emailAllowedStyles: Record<string, RegExp[]> = {
  color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/],
  "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/],
  padding: [/^[\d.]+(px|em)( [\d.]+(px|em)){0,3}$/],
  "border-radius": [/^[\d.]+(px|em)$/],
  display: [/^inline-block$/, /^block$/],
  "font-weight": [/^(bold|[1-9]00)$/],
  "text-align": [/^(left|center|right)$/],
  width: [/^[\d.]+(px|%)$/],
  "max-width": [/^[\d.]+(px|%)$/],
  height: [/^auto$/, /^[\d.]+px$/],
  "text-decoration": [/^(none|underline)$/]
};

export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "span",
      "img"
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "style"],
      span: ["style"],
      p: ["style"],
      img: ["src", "alt", "width", "style"]
    },
    allowedStyles: {
      "*": emailAllowedStyles
    },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: {
      img: ["https"]
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank"
      }),
      img: (tagName, attribs) => {
        const requestedWidth = Number.parseInt(attribs.width ?? "", 10);
        const width =
          Number.isFinite(requestedWidth) && requestedWidth > 0
            ? Math.min(requestedWidth, EMAIL_MAX_IMAGE_WIDTH)
            : EMAIL_MAX_IMAGE_WIDTH;

        return {
          tagName,
          attribs: {
            src: attribs.src ?? "",
            alt: attribs.alt ?? "",
            width: String(width),
            style: `max-width:100%;height:auto;width:${width}px;`
          }
        };
      }
    }
  });
}

export function sanitizeRichText(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a"
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"]
    },
    allowedSchemes: ["https", "http", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank"
      })
    }
  });
}
