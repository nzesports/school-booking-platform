import { describe, expect, it } from "vitest";

import { renderBrandedEmail } from "@/lib/services/email-layout";

describe("renderBrandedEmail", () => {
  it("wraps content in the NZ Esports email shell", () => {
    const html = renderBrandedEmail("<p>Hello school</p>");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<p>Hello school</p>");
    expect(html).toContain("NZ Esports");
    expect(html).toContain(">Unsubscribe</a>");
  });

  it("can omit unsubscribe controls for an inbound contact notification", () => {
    const html = renderBrandedEmail("<p>New contact</p>", { includeUnsubscribe: false });

    expect(html).toContain("<p>New contact</p>");
    expect(html).not.toContain(">Unsubscribe</a>");
    expect(html).not.toContain("?subject=Unsubscribe");
  });
});
