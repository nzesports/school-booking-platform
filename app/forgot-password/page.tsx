import { redirect } from "next/navigation";

import { buildPublicAuthPath } from "@/lib/services/auth";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  redirect(
    buildPublicAuthPath("/", {
      auth: "forgot",
      error: typeof query.error === "string" ? query.error : null,
      sent: typeof query.sent === "string" ? query.sent : null
    })
  );
}
