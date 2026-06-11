import { redirect } from "next/navigation";

import { buildPublicAuthPath } from "@/lib/services/auth";

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  redirect(
    buildPublicAuthPath("/", {
      auth: "signup",
      role: query.role === "ambassador" ? "ambassador" : "school",
      error: typeof query.error === "string" ? query.error : null
    })
  );
}
