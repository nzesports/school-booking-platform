// Seeds the lifecycle email templates that were added after the original
// seed: feedback request, school welcome, ambassador application received,
// ambassador approved. Idempotent — skips keys that already exist.
//
// Run from the project root:  node scripts/seed-email-templates.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const button = (href, label) =>
  `<p><a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#18a83b;color:#ffffff;padding:12px 26px;border-radius:10px;font-weight:bold;text-decoration:none;">${label}</a></p>`;

const templates = [
  {
    template_key: "school_feedback_request",
    name: "School feedback request",
    subject: "How was your {{presentationTitle}} session?",
    body_html:
      "<p>Kia ora {{contactName}},</p>" +
      "<p>Thanks for hosting the <strong>{{presentationTitle}}</strong> session at <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong>.</p>" +
      "<p>We'd love your feedback — it takes about two minutes and helps us keep improving for schools across Aotearoa.</p>" +
      button("{{reviewUrl}}", "Leave your feedback") +
      "<p>No login needed. If your school has a portal account you can also leave it under Bookings → Leave review.</p>",
    body_text:
      "Kia ora {{contactName}}, thanks for hosting {{presentationTitle}} at {{schoolName}} on {{sessionDate}}. Leave your feedback here (no login needed): {{reviewUrl}}"
  },
  {
    template_key: "school_welcome",
    name: "School welcome",
    subject: "Welcome to the NZ Esports booking platform",
    body_html:
      "<p>Kia ora {{contactName}},</p>" +
      "<p>Welcome! Your school portal account for <strong>{{schoolName}}</strong> is ready.</p>" +
      "<p>From your portal you can track bookings, request reschedules, access session resources, and leave feedback after each visit.</p>" +
      button("{{loginUrl}}", "Open your school portal"),
    body_text:
      "Kia ora {{contactName}}, welcome! Your school portal account for {{schoolName}} is ready: {{loginUrl}}"
  },
  {
    template_key: "ambassador_application_received",
    name: "Ambassador application received",
    subject: "We've received your ambassador application",
    body_html:
      "<p>Kia ora {{ambassadorName}},</p>" +
      "<p>Thanks for applying to become an NZ Esports ambassador!</p>" +
      "<p>Our team reviews every application personally — we'll be in touch once yours has been looked at. Once approved, you'll get full access to the ambassador portal with open bookings, training, and resources.</p>",
    body_text:
      "Kia ora {{ambassadorName}}, thanks for applying to become an NZ Esports ambassador! We'll be in touch once your application has been reviewed."
  },
  {
    template_key: "school_booking_rescheduled",
    name: "School booking rescheduled",
    subject: "Your NZ Esports presentation has been rescheduled",
    body_html:
      "<p>Hi {{contactName}},</p>" +
      "<p>Your reschedule request has been sorted — the <strong>{{presentationTitle}}</strong> session for <strong>{{schoolName}}</strong> is now confirmed for <strong>{{sessionDate}}</strong>.</p>" +
      "<p>{{calendarLinks}}</p>" +
      "<p>We'll send a reminder closer to the day.</p>",
    body_text:
      "Hi {{contactName}}, your {{presentationTitle}} session for {{schoolName}} has been rescheduled and is confirmed for {{sessionDate}}."
  },
  {
    template_key: "school_session_reminder",
    name: "Upcoming session reminder",
    subject: "Coming up: {{presentationTitle}} at your school",
    body_html:
      "<p>Hi {{contactName}},</p>" +
      "<p>A quick reminder that the <strong>{{presentationTitle}}</strong> session at <strong>{{schoolName}}</strong> is coming up on <strong>{{sessionDate}}</strong>.</p>" +
      "<p>Handy checklist: projector or screen ready, microphone if the space needs one, and let the office know our ambassador is visiting.</p>",
    body_text:
      "Hi {{contactName}}, a reminder that {{presentationTitle}} at {{schoolName}} is coming up on {{sessionDate}}."
  },
  {
    template_key: "ambassador_approved",
    name: "Ambassador approved",
    subject: "You're in — welcome to the NZ Esports ambassador team!",
    body_html:
      "<p>Kia ora {{ambassadorName}},</p>" +
      "<p>Great news — your ambassador application has been <strong>approved</strong>!</p>" +
      "<p>Your ambassador portal is now unlocked: browse open school bookings, complete your training modules, and set up your payment details so you're ready for your first session.</p>" +
      button("{{loginUrl}}", "Open your ambassador portal"),
    body_text:
      "Kia ora {{ambassadorName}}, your ambassador application has been approved! Open your portal here: {{loginUrl}}"
  },
  {
    template_key: "ambassador_withdrawal_approved",
    name: "Ambassador withdrawal approved",
    subject: "Withdrawal approved: {{presentationTitle}}",
    body_html:
      "<p>Kia ora {{ambassadorName}},</p>" +
      "<p>Your withdrawal from <strong>{{presentationTitle}}</strong> at <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong> has been approved.</p>" +
      "<p>The session has been reopened for another ambassador. Thank you for letting us know early.</p>" +
      button("{{portalUrl}}", "Open your ambassador portal"),
    body_text:
      "Kia ora {{ambassadorName}}, your withdrawal from {{presentationTitle}} at {{schoolName}} on {{sessionDate}} has been approved. Open your portal: {{portalUrl}}"
  },
  {
    template_key: "ambassador_withdrawal_declined",
    name: "Ambassador withdrawal declined",
    subject: "Withdrawal update: {{presentationTitle}}",
    body_html:
      "<p>Kia ora {{ambassadorName}},</p>" +
      "<p>We've reviewed your withdrawal request for <strong>{{presentationTitle}}</strong> at <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong>.</p>" +
      "<p>You remain assigned to this session for now.</p>" +
      "<p><strong>Note from staff:</strong> {{staffNote}}</p>" +
      button("{{portalUrl}}", "Open your upcoming sessions"),
    body_text:
      "Kia ora {{ambassadorName}}, your withdrawal request for {{presentationTitle}} at {{schoolName}} on {{sessionDate}} was declined. Staff note: {{staffNote}} Open your portal: {{portalUrl}}"
  }
];

for (const template of templates) {
  const { data: existing } = await admin
    .from("email_templates")
    .select("id")
    .eq("template_key", template.template_key)
    .maybeSingle();

  if (existing) {
    console.log(`Skipped (already exists): ${template.template_key}`);
    continue;
  }

  const { error } = await admin.from("email_templates").insert(template);

  if (error) {
    console.error(`FAILED inserting ${template.template_key}:`, error.message);
    process.exit(1);
  }

  console.log(`Inserted: ${template.template_key}`);
}

console.log("Email templates seeded.");
