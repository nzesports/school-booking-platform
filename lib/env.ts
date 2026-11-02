import { siteUrl } from "@/lib/site-url";

const env = {
  siteUrl,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || "info@esf.nz",
  brevoSenderName: process.env.BREVO_SENDER_NAME || "NZ Esports",
  brevoContactEmail: process.env.BREVO_CONTACT_EMAIL || "schools@esf.nz",
  // Brevo contact list that opted-in teachers/school contacts are added to.
  brevoTeacherListId: Number(process.env.BREVO_TEACHER_LIST_ID || 15),
  cronSecret: process.env.CRON_SECRET,
  microsoftTenantId: process.env.MICROSOFT_GRAPH_TENANT_ID,
  microsoftClientId: process.env.MICROSOFT_GRAPH_CLIENT_ID,
  microsoftClientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
  microsoftCalendarId: process.env.MICROSOFT_GRAPH_CALENDAR_ID,
  microsoftUserId: process.env.MICROSOFT_GRAPH_USER_ID,
  // Local test server only: the Supabase Docker stack's Mailpit inbox.
  localMailApiUrl: process.env.LOCAL_MAIL_API_URL,
  // Test server only: send real email through Brevo, but deliver every
  // message to this one inbox instead of its real recipients.
  testEmailRedirectTo: process.env.TEST_EMAIL_REDIRECT_TO?.trim()
};

const testEmailRedirectTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.testEmailRedirectTo ?? "")
  ? env.testEmailRedirectTo
  : undefined;
const isLocalSupabase = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(env.supabaseUrl ?? "");

export const config = {
  ...env,
  isSupabaseConfigured: Boolean(env.supabaseUrl && env.supabasePublishableKey),
  isSupabaseAdminConfigured: Boolean(
    env.supabaseUrl && env.supabasePublishableKey && env.supabaseServiceRoleKey
  ),
  testEmailRedirectTo,
  // A local database (seeded demo schools/ambassadors) never emails real
  // people: Brevo only counts as configured there while the redirect is on.
  isBrevoConfigured: Boolean(env.brevoApiKey) && (!isLocalSupabase || Boolean(testEmailRedirectTo)),
  // Only ever a loopback address, so a stray setting can't send mail anywhere.
  isLocalMailConfigured: /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(env.localMailApiUrl ?? ""),
  isMicrosoftGraphConfigured: Boolean(
    env.microsoftTenantId &&
      env.microsoftClientId &&
      env.microsoftClientSecret &&
      env.microsoftUserId
  )
};
