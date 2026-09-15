// Preview by default; --apply updates only the listed school booking templates.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const templates = JSON.parse(readFileSync(new URL("./data/school-email-templates.json", import.meta.url), "utf8"));
const { data: existing, error } = await db.from("email_templates").select("*")
  .in("template_key", templates.map((template) => template.template_key));
if (error) throw new Error(`Template read failed: ${error.code}`);
console.log(`Project: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
for (const template of templates) {
  console.log(`${existing.some((row) => row.template_key === template.template_key) ? "Update" : "Create"}: ${template.template_key}`);
}
if (process.argv.includes("--apply")) {
  const backup = join(mkdtempSync(join(tmpdir(), "school-email-templates-")), "before.json");
  writeFileSync(backup, JSON.stringify(existing, null, 2), { mode: 0o600 });
  console.log(`Backup: ${backup}`);
  for (const template of templates) {
    const old = existing.find((row) => row.template_key === template.template_key);
    const request = old
      ? db.from("email_templates").update(template).eq("id", old.id)
          .eq("body_html", old.body_html).eq("subject", old.subject)
          .eq("updated_at", old.updated_at)
      : db.from("email_templates").insert({ ...template, is_active: true });
    const { data, error: writeError } = await request.select("template_key");
    if (writeError || data?.length !== 1) throw new Error(`Update stopped for ${template.template_key}: ${writeError?.code ?? "concurrent edit"}`);
  }
  const { data: saved, error: verifyError } = await db.from("email_templates")
    .select("template_key, subject, body_html, body_text").in("template_key", templates.map((template) => template.template_key));
  if (verifyError || templates.some((template) => {
    const actual = saved?.find((row) => row.template_key === template.template_key);
    return !actual || ["subject", "body_html", "body_text"].some((field) => actual[field] !== template[field]);
  })) throw new Error("Template read-back verification failed.");
  console.log(`Saved and verified ${templates.length} school booking templates. No emails sent.`);
}
