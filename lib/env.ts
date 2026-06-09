const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || "info@esf.nz",
  brevoSenderName: process.env.BREVO_SENDER_NAME || "NZ Esports",
  microsoftTenantId: process.env.MICROSOFT_GRAPH_TENANT_ID,
  microsoftClientId: process.env.MICROSOFT_GRAPH_CLIENT_ID,
  microsoftClientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
  microsoftCalendarId: process.env.MICROSOFT_GRAPH_CALENDAR_ID
};

export const config = {
  ...env,
  isSupabaseConfigured: Boolean(env.supabaseUrl && env.supabasePublishableKey),
  isSupabaseAdminConfigured: Boolean(
    env.supabaseUrl && env.supabasePublishableKey && env.supabaseServiceRoleKey
  ),
  isBrevoConfigured: Boolean(env.brevoApiKey),
  isMicrosoftGraphConfigured: Boolean(
    env.microsoftTenantId &&
      env.microsoftClientId &&
      env.microsoftClientSecret &&
      env.microsoftCalendarId
  )
};
