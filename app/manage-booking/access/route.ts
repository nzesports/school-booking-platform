import { NextResponse } from "next/server";
import { config } from "@/lib/env";

// Retire old emailed links; all access now starts with a reference in the form.
export async function GET() {
  const response = NextResponse.redirect(new URL("/manage-booking", config.siteUrl));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
