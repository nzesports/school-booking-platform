# Connect the schools@esf.nz calendar

## Prepared in the app

- Target mailbox: `schools@esf.nz` (local configuration and example file).
- Calendar: the mailbox's default calendar. A separate calendar ID is optional.
- Authentication: Microsoft Graph application credentials, running on the server.
- Status: not connected; Microsoft administrator authorization and credentials are still needed.

## Request for the Microsoft 365 administrator

Please enable the NZ Esports booking platform at https://book.nzesports.org.nz to create and update events in the default calendar of the shared mailbox **schools@esf.nz**.

1. Confirm schools@esf.nz is an Exchange Online mailbox with a calendar, rather than just an email alias or distribution list.
2. Create a single-tenant Microsoft Entra app registration named **NZ Esports Booking Platform**.
3. Authorize calendar write access for this mailbox. Prefer Exchange Online Application RBAC with **Application Calendars.ReadWrite**, scoped only to schools@esf.nz. Do not also grant an unrestricted tenant-wide Calendars.ReadWrite permission: Entra and Exchange grants are additive.
4. Create a client secret and record its expiry date for rotation.
5. Configure these server-only environment variables securely in the website's production hosting project, or provide them through your approved secret-sharing method:

   - `MICROSOFT_GRAPH_TENANT_ID`: directory/tenant ID
   - `MICROSOFT_GRAPH_CLIENT_ID`: application/client ID
   - `MICROSOFT_GRAPH_CLIENT_SECRET`: secret **value**, not secret ID
   - `MICROSOFT_GRAPH_USER_ID`: `schools@esf.nz` (or the mailbox's actual UPN/object ID if this address is an alias)
   - `MICROSOFT_GRAPH_CALENDAR_ID`: leave unset for the default calendar

No redirect URI is needed for the app's existing client-credentials flow. No mailbox password is needed. Do not place the secret in source control or ordinary chat/email.

Once the administrator has completed this, redeploy/restart the app to load the settings. Verify calendar access and arrange an approved test event before treating synchronization as operational. Existing bookings are not automatically backfilled merely by adding credentials.

## Microsoft references

- [Application authentication](https://learn.microsoft.com/en-us/graph/auth-v2-service)
- [Mailbox-scoped Exchange application roles](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac)
- [Create events in the default or a named calendar](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)
