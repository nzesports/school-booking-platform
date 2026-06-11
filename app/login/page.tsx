import { redirect } from "next/navigation";

import { buildPublicAuthPath } from "@/lib/services/auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  redirect(
    buildPublicAuthPath("/", {
      auth: "login",
      error: typeof query.error === "string" ? query.error : null,
      checkEmail: typeof query.checkEmail === "string" ? query.checkEmail : null,
      reset: typeof query.reset === "string" ? query.reset : null,
      loggedOut: typeof query.loggedOut === "string" ? query.loggedOut : null,
      verified: typeof query.verified === "string" ? query.verified : null,
      application: typeof query.application === "string" ? query.application : null
    })
  );
}
