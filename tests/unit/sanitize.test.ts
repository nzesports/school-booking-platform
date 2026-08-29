import { describe, expect, it } from "vitest";

import { sanitizeEmailHtml, sanitizeRichText } from "@/lib/services/sanitize";

describe("rich text sanitisation", () => {
  it("removes scripts and unsafe link schemes", () => {
    const result = sanitizeRichText(
      '<p>Hello<script>alert(1)</script><a href="javascript:alert(1)">there</a></p>'
    );

    expect(result).not.toContain("<script");
    expect(result).not.toContain("javascript:");
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it("keeps approved site rich-text tags", () => {
    expect(sanitizeRichText("<h2>Heading</h2><blockquote>Quote</blockquote>")).toBe(
      "<h2>Heading</h2><blockquote>Quote</blockquote>"
    );
  });
});

describe("email HTML sanitisation", () => {
  it("caps hosted image widths and supplies safe image styles", () => {
    const result = sanitizeEmailHtml(
      '<img src="https://example.nz/image.png" alt="Example" width="1200">'
    );

    expect(result).toContain('width="560"');
    expect(result).toContain("max-width:100%;height:auto;width:560px");
  });

  it("drops unsafe styles and non-https image sources", () => {
    const result = sanitizeEmailHtml(
      '<p style="position:fixed;color:#123456">Text</p><img src="http://example.nz/a.png">'
    );

    expect(result).not.toContain("position");
    expect(result).toContain("color:#123456");
    expect(result).not.toContain('src="http://');
  });
});
