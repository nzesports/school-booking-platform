import { createHmac, timingSafeEqual } from "node:crypto";

import { config } from "@/lib/env";

// School feedback links are signed so that knowing a session's UUID is not
// enough to submit the school's feedback form. Ambassadors can see session
// UUIDs, and school feedback must only ever come from the school, so the form
// opens only with a signature the server issued in the school's email (or via
// the staff "copy link" button). Rotating the signing key invalidates links
// already sent; schools can then request a fresh one from the page.
function signingKey() {
  return config.supabaseServiceRoleKey ?? null;
}

export function feedbackLinkToken(sessionId: string) {
  const key = signingKey();
  return key ? createHmac("sha256", key).update(`school-feedback:v1:${sessionId}`).digest("base64url") : null;
}

export function isValidFeedbackLinkToken(sessionId: string, token: string | null | undefined) {
  const expected = feedbackLinkToken(sessionId);

  if (!expected || !token) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return expectedBuffer.length === tokenBuffer.length && timingSafeEqual(expectedBuffer, tokenBuffer);
}

// App-relative path, for redirects back to the form.
export function feedbackPath(sessionId: string) {
  const token = feedbackLinkToken(sessionId);
  return `/feedback/${sessionId}${token ? `?t=${token}` : ""}`;
}

export function feedbackUrl(sessionId: string) {
  return `${config.siteUrl}${feedbackPath(sessionId)}`;
}
