// Shared by server code and client-safe auth/template helpers. Never import
// server credentials here.
export const PRODUCTION_SITE_URL = "https://book.nzesports.org.nz";

const previewUrl =
  process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;

export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  previewUrl ||
  (process.env.NODE_ENV === "production"
    ? PRODUCTION_SITE_URL
    : "http://localhost:3000")
).replace(/\/+$/, "");
