import { CalendarClock, CircleDollarSign, Mail } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const fieldClassName =
  "min-h-[46px] w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm text-[color:var(--navy)] outline-none focus:border-[rgba(24,168,59,0.45)]";

type SettingsMap = Record<string, Record<string, unknown>>;

function parseSettings(settings: Array<{ key: string; value: string }>): SettingsMap {
  const parsed: SettingsMap = {};

  for (const setting of settings) {
    try {
      const value = JSON.parse(setting.value) as unknown;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed[setting.key] = value as Record<string, unknown>;
      }
    } catch {
      // Non-JSON values (demo mode strings) simply fall back to defaults.
    }
  }

  return parsed;
}

function readString(section: Record<string, unknown> | undefined, key: string, fallback: string) {
  const value = section?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readNumber(section: Record<string, unknown> | undefined, key: string, fallback: number) {
  const value = section?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(section: Record<string, unknown> | undefined, key: string, fallback: boolean) {
  const value = section?.[key];
  return typeof value === "boolean" ? value : fallback;
}

export function SettingsWorkspace({
  settings,
  action,
  returnTo,
  notice
}: {
  settings: Array<{ key: string; value: string }>;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  notice?: { tone: "success" | "error"; message: string } | null;
}) {
  const parsed = parseSettings(settings);
  const bookingDefaults = parsed.booking_defaults;
  const branding = parsed.branding;
  const payments = parsed.payments;

  return (
    <div className="grid gap-5">
      {notice ? (
        <Card
          className={cn(
            "rounded-[24px] px-5 py-4 text-sm font-semibold",
            notice.tone === "error"
              ? "border-[#f2c6c6] bg-[#fff6f6] text-[#9d2424]"
              : "border-[#b9e2c7] bg-[#f4fbf6] text-[#1d6f35]"
          )}
        >
          {notice.message}
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsCard
          icon={<CalendarClock className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
          title="Booking defaults"
          description="Controls the public booking widget: which hours schools can request, how long each slot runs, and whether public holidays are blocked out."
          action={action}
          section="booking_defaults"
          returnTo={returnTo}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Bookings open from">
              <input
                type="time"
                name="startHour"
                defaultValue={readString(bookingDefaults, "startHour", "08:00")}
                required
                className={fieldClassName}
              />
            </Field>
            <Field label="Bookings close at">
              <input
                type="time"
                name="endHour"
                defaultValue={readString(bookingDefaults, "endHour", "16:00")}
                required
                className={fieldClassName}
              />
            </Field>
            <Field label="Slot length (minutes)">
              <input
                type="number"
                name="slotIntervalMinutes"
                min={5}
                max={240}
                step={5}
                defaultValue={readNumber(bookingDefaults, "slotIntervalMinutes", 60)}
                required
                className={fieldClassName}
              />
            </Field>
            <label className="flex min-h-[46px] items-center gap-3 self-end rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-medium text-[color:var(--navy)]">
              <input
                type="checkbox"
                name="publicHolidayBlock"
                defaultChecked={readBoolean(bookingDefaults, "publicHolidayBlock", true)}
                className="h-4 w-4 accent-[color:var(--green)]"
              />
              Block bookings on public holidays
            </label>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={<Mail className="h-5 w-5" />}
          iconClassName="bg-[#f1edfd] text-[#7c3aed]"
          title="Branding & email"
          description="The sender address schools and ambassadors see on platform emails, and the primary domain used in links."
          action={action}
          section="branding"
          returnTo={returnTo}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sender email">
              <input
                type="email"
                name="senderEmail"
                defaultValue={readString(branding, "senderEmail", "info@esf.nz")}
                required
                className={fieldClassName}
              />
            </Field>
            <Field label="Primary domain">
              <input
                type="text"
                name="primaryDomain"
                defaultValue={readString(branding, "primaryDomain", "schoolbookings.org.nz")}
                required
                className={fieldClassName}
              />
            </Field>
          </div>
        </SettingsCard>
      </div>

      <SettingsCard
        icon={<CircleDollarSign className="h-5 w-5" />}
        iconClassName="bg-[#e6f5ec] text-[#117a2e]"
        title="Payments"
        description="Defaults for ambassador session payouts: the standard payment per delivered session, the attendee count a report needs before it becomes payment-eligible, and where invoices are sent."
        action={action}
        section="payments"
        returnTo={returnTo}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Default payment per session ($)">
            <input
              type="number"
              name="defaultAmountDollars"
              min={0}
              step={0.01}
              defaultValue={readNumber(payments, "defaultAmountCents", 25000) / 100}
              required
              className={fieldClassName}
            />
          </Field>
          <Field label="Eligible attendee threshold">
            <input
              type="number"
              name="eligibleAttendeeThreshold"
              min={0}
              defaultValue={readNumber(payments, "eligibleAttendeeThreshold", 100)}
              required
              className={fieldClassName}
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              name="currency"
              maxLength={3}
              defaultValue={readString(payments, "currency", "NZD")}
              required
              className={cn(fieldClassName, "uppercase")}
            />
          </Field>
          <Field label="Finance email">
            <input
              type="email"
              name="financeEmail"
              defaultValue={readString(payments, "financeEmail", "info@esf.nz")}
              required
              className={fieldClassName}
            />
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}

function SettingsCard({
  icon,
  iconClassName,
  title,
  description,
  action,
  section,
  returnTo,
  children
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
  action: (formData: FormData) => void | Promise<void>;
  section: string;
  returnTo: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-[28px]">
      <form action={action} className="grid gap-5">
        <input type="hidden" name="section" value={section} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]",
              iconClassName
            )}
          >
            {icon}
          </span>
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">{description}</p>
          </div>
        </div>

        {children}

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex min-h-[46px] items-center justify-center rounded-[14px] bg-[color:var(--green)] px-5 text-sm font-semibold text-white transition hover:bg-[#128a30]"
          >
            Save changes
          </button>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </span>
      {children}
    </label>
  );
}
