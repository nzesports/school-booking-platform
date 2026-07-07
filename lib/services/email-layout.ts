import { config } from "@/lib/env";

// Assets are served from the public Supabase storage bucket so email clients
// can always load them (a localhost siteUrl would render broken images).
const ASSETS_BASE =
  "https://yrzwujybvomjvehqvpvm.supabase.co/storage/v1/object/public/public-assets";
const NZ_ESPORTS_LOGO = `${ASSETS_BASE}/brand%20logos/NZ%20Esports_Logo_Black.png`;
const BEROCCA_LOGO = `${ASSETS_BASE}/brand%20logos/Berocca%20Logo_LARGE.png`;

const SOCIAL_LINKS = [
  { href: "https://www.facebook.com/nzesports", icon: "facebook", label: "Facebook" },
  { href: "https://www.instagram.com/nzesports", icon: "instagram", label: "Instagram" },
  { href: "https://www.linkedin.com/company/nzesports", icon: "linkedin", label: "LinkedIn" },
  { href: "https://www.tiktok.com/@nzesports", icon: "tiktok", label: "TikTok" },
  { href: "https://www.youtube.com/@nzesports", icon: "youtube", label: "YouTube" }
];

const WEBSITE_URL = "https://www.nzesports.org.nz/";

// Wraps every outgoing email body in the NZ Esports branded shell: logo
// header with the School Presentations pill, white content card, and a footer
// with the logo, social icons, Berocca partner block, website/platform links,
// and the unsubscribe option. Table layout + inline styles only — email
// clients strip stylesheets — and all imagery is hosted https with fixed
// pixel widths so nothing gets blocked or clipped.
export function renderBrandedEmail(bodyHtml: string) {
  const platformUrl = config.siteUrl;
  const unsubscribeHref = `mailto:${config.brevoSenderEmail}?subject=Unsubscribe`;

  const socialIcons = SOCIAL_LINKS.map(
    (social) => `
                    <td style="padding:0 6px;">
                      <a href="${social.href}" style="display:block; width:38px; height:38px; border-radius:50%; background:#e9f2f8; text-align:center; text-decoration:none;">
                        <img
                          src="${ASSETS_BASE}/social%20icons/${social.icon}.png"
                          alt="${social.label}"
                          width="18"
                          style="display:inline-block; width:18px; max-width:18px; height:auto; margin-top:10px; border:0;"
                        >
                      </a>
                    </td>`
  ).join("\n");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>

  <body style="margin:0; padding:0; background:#eef8fb; font-family:Arial, Helvetica, sans-serif; color:#040F4B;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#edfafa 0%,#e9f5fb 45%,#f7fbff 100%); padding:40px 16px;">
      <tr>
        <td align="center">

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; background:#ffffff; border-radius:24px; overflow:hidden; border:1px solid #dcebf3;">

            <!-- Header -->
            <tr>
              <td align="center" style="padding:42px 32px 22px 32px; text-align:center;">
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td align="center" style="text-align:center; padding:0 0 26px 0;">
                      <a href="${WEBSITE_URL}" style="display:inline-block; text-decoration:none;">
                        <img
                          src="${NZ_ESPORTS_LOGO}"
                          alt="NZ Esports"
                          width="155"
                          style="display:block; width:155px; max-width:155px; height:auto; border:0; margin:0 auto;"
                        >
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="text-align:center;">
                      <div style="display:inline-block; padding:14px 28px; background:#e9f8ef; color:#13a64a; border-radius:999px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase;">
                        School Presentations
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:8px 40px 40px 40px; text-align:left; font-size:15px; line-height:1.7; color:#040F4B;">
${bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="background:#f6fbfd; padding:36px 32px; text-align:center; border-top:1px solid #dcebf3;">

                <a href="${WEBSITE_URL}" style="display:inline-block; text-decoration:none;">
                  <img
                    src="${NZ_ESPORTS_LOGO}"
                    alt="NZ Esports"
                    width="135"
                    style="display:block; margin:0 auto 24px auto; width:135px; max-width:135px; height:auto; border:0;"
                  >
                </a>

                <!-- Social icons -->
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 26px auto;">
                  <tr>
${socialIcons}
                  </tr>
                </table>

                <!-- Berocca partner block -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 26px auto; max-width:420px; background:#ffffff; border:1px solid #dcebf3; border-radius:18px;">
                  <tr>
                    <td align="center" style="padding:20px 20px; text-align:center;">
                      <p style="margin:0 0 14px 0; font-size:12px; line-height:1.5; color:#7a8798; letter-spacing:1px; text-transform:uppercase; font-weight:700;">
                        School presentations are brought to you by
                      </p>
                      <a href="https://www.berocca.co.nz/" style="display:inline-block; text-decoration:none;">
                        <img
                          src="${BEROCCA_LOGO}"
                          alt="Berocca"
                          width="130"
                          style="display:block; margin:0 auto; width:130px; max-width:130px; height:auto; border:0;"
                        >
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 auto 8px auto; max-width:500px; font-size:12px; line-height:1.6; color:#7a8798; text-align:center;">
                  Helping schools build healthier, more supportive conversations around gaming and esports.
                </p>

                <p style="margin:0 auto 8px auto; max-width:500px; font-size:12px; line-height:1.6; color:#7a8798; text-align:center;">
                  <a href="${WEBSITE_URL}" style="color:#13a64a; text-decoration:underline;">nzesports.org.nz</a>
                  &nbsp;·&nbsp;
                  <a href="${platformUrl}" style="color:#13a64a; text-decoration:underline;">Booking platform</a>
                  &nbsp;·&nbsp;
                  <a href="${unsubscribeHref}" style="color:#7a8798; text-decoration:underline;">Unsubscribe</a>
                </p>

                <p style="margin:0 auto; max-width:500px; font-size:12px; line-height:1.6; color:#7a8798; text-align:center;">
                  &copy; ${new Date().getFullYear()}
                  <a href="${WEBSITE_URL}" style="color:#040F4B; text-decoration:none; font-weight:700;">NZ Esports</a>.
                  All rights reserved.
                </p>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;
}
