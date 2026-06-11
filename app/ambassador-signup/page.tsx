import { redirect } from "next/navigation";

export default function AmbassadorSignupPage() {
  redirect("/signup?role=ambassador");
}
