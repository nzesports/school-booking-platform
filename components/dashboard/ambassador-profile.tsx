"use client";

import {
  BadgeCheck,
  Banknote,
  CalendarX2,
  Clock3,
  CreditCard,
  ExternalLink,
  FileText,
  Hash,
  Info,
  Landmark,
  Mail,
  MapPin,
  MessageSquareText,
  PencilLine,
  Percent,
  Phone,
  Star,
  StickyNote,
  UserRound,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { SchoolLogoUploader } from "@/components/dashboard/school-logo-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagMultiSelect } from "@/components/ui/tag-multi-select";
import { Textarea } from "@/components/ui/textarea";
import type { AmbassadorProfile, Region } from "@/lib/domain/types";
import { cn, formatShortDate } from "@/lib/utils";

const WEEKDAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" }
];

const BOOKING_TYPE_OPTIONS = [
  { value: "in_person", label: "In-person" },
  { value: "school_talks", label: "School talks" },
  { value: "workshops", label: "Workshops" },
  { value: "online", label: "Online" }
];

export type AmbassadorProfileStats = {
  schoolVisits: number;
  invoicesSubmittedCount: number;
  latestInvoiceSubmittedAt?: string;
  ratingAverage: number | null;
  ratingCount: number;
};

type SectionKey = "personal" | "payment" | "tax" | "preferences";

export function AmbassadorProfileWorkspace({
  ambassador,
  stats,
  regions,
  action
}: {
  ambassador: AmbassadorProfile;
  stats: AmbassadorProfileStats;
  regions: Region[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<Record<SectionKey, boolean>>({
    personal: false,
    payment: false,
    tax: false,
    preferences: false
  });
  const [formVersion, setFormVersion] = useState(0);

  const details = useMemo(() => ambassador.details ?? {}, [ambassador.details]);
  const regionNameBySlug = useMemo(
    () => new Map(regions.map((region) => [region.slug, region.name])),
    [regions]
  );
  const bookingTypeLabels = (details.bookingTypes ?? [])
    .map(
      (value) => BOOKING_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
    )
    .filter(Boolean);
  const preferredTimeRows = (details.preferredTimes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      return match ? { label: match[1], value: match[2] } : { label: "", value: line };
    });

  const completion = useMemo(() => {
    const checks = [
      Boolean(ambassador.name),
      Boolean(ambassador.phone),
      ambassador.regionSlug !== "unassigned",
      Boolean(details.mailingAddress),
      Boolean(ambassador.bankAccountName),
      Boolean(ambassador.bankAccountNumber),
      Boolean(details.payoutEmail),
      Boolean(details.invoiceName),
      Boolean(details.irdNumber || ambassador.gstNumber),
      ambassador.travelRegions.length > 0,
      (details.bookingTypes ?? []).length > 0,
      Boolean(details.preferredTimes) ||
        Object.keys(details.weeklyAvailability ?? {}).length > 0
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [ambassador, details]);

  const toggle = (key: SectionKey) =>
    setEditing((current) => ({ ...current, [key]: !current[key] }));

  const initials = ambassador.name
    .replace(/^Demo\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <form key={formVersion} action={action} className="grid gap-5">
      {/* ------------------------------------------------ header card */}
      <section className="surface-panel rounded-[28px] p-6 md:p-7">
        <div className="grid items-center gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,2fr)]">
          <div className="flex items-center gap-4">
            {ambassador.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ambassador.imageUrl}
                alt={`${ambassador.name} profile image`}
                className="h-16 w-16 shrink-0 rounded-full border border-[color:var(--border-soft)] bg-white object-cover"
              />
            ) : (
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #071448, #10265f)" }}
              >
                {initials || "A"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[1.35rem] font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                {ambassador.name}
              </p>
              <p className="text-sm text-[color:var(--text-soft)]">NZ Esports Ambassador</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--green-soft)] px-3 py-1 text-xs font-semibold text-[#1d6f35]">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {ambassador.status === "approved" ? "Approved" : ambassador.status}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2f8] px-3 py-1 text-xs font-semibold text-[color:var(--navy)]">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--green)]" />
                  Active
                </span>
              </div>
            </div>
          </div>

          <div className="xl:border-l xl:border-[color:var(--border-soft)] xl:pl-7">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[color:var(--navy)]">Profile completion</span>
              <span className="font-semibold text-[color:var(--green)]">{completion}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[#e6ecf5]">
              <div
                className="h-full rounded-full bg-[linear-gradient(135deg,var(--green),var(--green-bright))]"
                style={{ width: `${completion}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-[color:var(--text-soft)]">
              {completion >= 80 ? "Great work! Keep it up." : "Fill in the gaps to get booked faster."}
            </p>
            <Link
              href="/ambassador"
              className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563eb] hover:underline"
            >
              View profile
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-y-6 md:grid-cols-4 md:gap-y-0 md:divide-x md:divide-[color:var(--border-soft)]">
            <HeaderStat
              icon={<MapPin className="h-5 w-5" />}
              iconClassName="bg-[#e3f2fd] text-[#1565c0]"
              label="Region"
              value={ambassador.regionName ?? "Not set"}
              hint={ambassador.travelRegions.length > 0 ? "Plus travel regions" : undefined}
            />
            <HeaderStat
              icon={<UsersRound className="h-5 w-5" />}
              iconClassName="bg-[#ece9ff] text-[#5b4fc0]"
              label="School visits"
              value={String(stats.schoolVisits)}
              hint="Delivered sessions"
            />
            <HeaderStat
              icon={<FileText className="h-5 w-5" />}
              iconClassName="bg-[color:var(--green-soft)] text-[color:var(--green)]"
              label="Invoices"
              value={String(stats.invoicesSubmittedCount)}
              hint={
                stats.latestInvoiceSubmittedAt
                  ? `Latest ${formatShortDate(stats.latestInvoiceSubmittedAt)}`
                  : "None submitted yet"
              }
            />
            <HeaderStat
              icon={<Star className="h-5 w-5" />}
              iconClassName="bg-[#fff3d8] text-[#b7791f]"
              label="Booking rating"
              value={stats.ratingAverage ? `${stats.ratingAverage.toFixed(1)} / 5` : "—"}
              hint={
                stats.ratingCount > 0
                  ? `Based on ${stats.ratingCount} report${stats.ratingCount === 1 ? "" : "s"}`
                  : "No reports yet"
              }
            />
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-[28px] p-6 md:p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Profile image
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          Update your portal photo
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[color:var(--text-soft)]">
          Upload a square profile image. You can scale and reposition it before saving.
        </p>
        <div className="mt-5">
          <SchoolLogoUploader
            currentLogoUrl={ambassador.imageUrl}
            schoolName={ambassador.name}
            inputName="avatar"
            uploadLabel="Upload profile image"
            chooseLabel="Choose profile image"
            emptyLabel={initials || "A"}
            helperText="Square image used across your dashboard profile."
          />
        </div>
      </section>

      {/* ------------------------------------------------ detail cards */}
      <div className="grid gap-5 xl:grid-cols-3">
        <ProfileSection
          title="Personal details"
          editing={editing.personal}
          onToggle={() => toggle("personal")}
        >
          <ProfileField
            icon={<UserRound className="h-4 w-4" />}
            label="Full name"
            editing={editing.personal}
            name="fullName"
            value={ambassador.name}
            input={<Input name="fullName" defaultValue={ambassador.name} required />}
          />
          <ProfileField
            icon={<Mail className="h-4 w-4" />}
            label="Email address"
            editing={false}
            name=""
            value={ambassador.email}
          />
          <ProfileField
            icon={<Phone className="h-4 w-4" />}
            label="Phone number"
            editing={editing.personal}
            name="phone"
            value={ambassador.phone ?? ""}
            input={<Input name="phone" defaultValue={ambassador.phone ?? ""} placeholder="+64 21 000 0000" />}
          />
          <ProfileField
            icon={<MapPin className="h-4 w-4" />}
            label="Region / home base"
            editing={editing.personal}
            name="regionSlug"
            value={ambassador.regionSlug === "unassigned" ? "" : ambassador.regionSlug}
            displayValue={ambassador.regionName ?? ""}
            input={
              <Select
                name="regionSlug"
                defaultValue={ambassador.regionSlug === "unassigned" ? "" : ambassador.regionSlug}
              >
                <option value="">Select your region</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.slug}>
                    {region.name}
                  </option>
                ))}
              </Select>
            }
          />
          <ProfileField
            icon={<FileText className="h-4 w-4" />}
            label="Mailing address"
            editing={editing.personal}
            name="mailingAddress"
            value={details.mailingAddress ?? ""}
            input={
              <Input
                name="mailingAddress"
                defaultValue={details.mailingAddress ?? ""}
                placeholder="12 Example Street, Suburb, City 1010"
              />
            }
          />
        </ProfileSection>

        <ProfileSection
          title="Payment details"
          editing={editing.payment}
          onToggle={() => toggle("payment")}
        >
          <ProfileField
            icon={<Landmark className="h-4 w-4" />}
            label="Account name"
            editing={editing.payment}
            name="bankAccountName"
            value={ambassador.bankAccountName ?? ""}
            input={
              <Input
                name="bankAccountName"
                defaultValue={ambassador.bankAccountName ?? ""}
                placeholder={ambassador.name}
              />
            }
          />
          <ProfileField
            icon={<CreditCard className="h-4 w-4" />}
            label="Bank account number"
            editing={editing.payment}
            name="bankAccountNumber"
            value={ambassador.bankAccountNumber ?? ""}
            input={
              <Input
                name="bankAccountNumber"
                defaultValue={ambassador.bankAccountNumber ?? ""}
                placeholder="12-3456-7890123-00"
              />
            }
          />
          <ProfileField
            icon={<Mail className="h-4 w-4" />}
            label="Preferred payout email"
            editing={editing.payment}
            name="payoutEmail"
            value={details.payoutEmail ?? ""}
            input={
              <Input
                name="payoutEmail"
                type="email"
                defaultValue={details.payoutEmail ?? ""}
                placeholder={ambassador.email}
              />
            }
          />
          <ProfileField
            icon={<Banknote className="h-4 w-4" />}
            label="Payout method"
            editing={editing.payment}
            name="payoutMethod"
            value={details.payoutMethod ?? "bank_transfer"}
            displayValue="Bank transfer"
            input={
              <Select name="payoutMethod" defaultValue={details.payoutMethod ?? "bank_transfer"}>
                <option value="bank_transfer">Bank transfer</option>
              </Select>
            }
          />
          <p className="mt-1 flex items-center gap-2 rounded-[14px] bg-[#eef4fd] px-3.5 py-2.5 text-[13px] leading-5 text-[#1e4fae]">
            <Info className="h-4 w-4 shrink-0" />
            Invoices are paid via bank transfer to your account.
          </p>
        </ProfileSection>

        <ProfileSection title="Tax & invoicing" editing={editing.tax} onToggle={() => toggle("tax")}>
          <ProfileField
            icon={<FileText className="h-4 w-4" />}
            label="Invoice name"
            editing={editing.tax}
            name="invoiceName"
            value={details.invoiceName ?? ""}
            input={
              <Input
                name="invoiceName"
                defaultValue={details.invoiceName ?? ""}
                placeholder={ambassador.name}
              />
            }
          />
          <ProfileField
            icon={<Hash className="h-4 w-4" />}
            label="IRD / tax reference"
            editing={editing.tax}
            name="irdNumber"
            value={details.irdNumber ?? ""}
            input={
              <Input name="irdNumber" defaultValue={details.irdNumber ?? ""} placeholder="123-456-789" />
            }
          />
          <ProfileField
            icon={<Percent className="h-4 w-4" />}
            label="GST number (optional)"
            editing={editing.tax}
            name="gstNumber"
            value={ambassador.gstNumber ?? ""}
            input={
              <Input name="gstNumber" defaultValue={ambassador.gstNumber ?? ""} placeholder="123-456-789" />
            }
          />
          <ProfileField
            icon={<StickyNote className="h-4 w-4" />}
            label="Billing note"
            editing={editing.tax}
            name="billingNote"
            value={details.billingNote ?? ""}
            input={
              <Input
                name="billingNote"
                defaultValue={details.billingNote ?? ""}
                placeholder="Please include event name on invoice."
              />
            }
          />
        </ProfileSection>
      </div>

      {/* --------------------------------- booking preferences & availability */}
      <ProfileSection
        title="Booking preferences & availability"
        editing={editing.preferences}
        onToggle={() => toggle("preferences")}
        className="rounded-[28px]"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)_minmax(0,0.9fr)]">
          <div className="grid content-start gap-6">
            <div>
              <SubHeading icon={<MapPin className="h-4 w-4" />}>Preferred booking regions</SubHeading>
              {editing.preferences ? (
                <div className="mt-2.5">
                  <TagMultiSelect
                    name="travelRegions"
                    options={regions.map((region) => ({ label: region.name, value: region.slug }))}
                    defaultValue={ambassador.travelRegions}
                    placeholder="Choose the regions you'll present in"
                  />
                </div>
              ) : (
                <>
                  <input type="hidden" name="travelRegions" value={ambassador.travelRegions.join(",")} />
                  <ChipRow
                    items={ambassador.travelRegions.map(
                      (slug) => regionNameBySlug.get(slug) ?? slug
                    )}
                    tone="green"
                    emptyText="No preferred regions yet."
                  />
                </>
              )}
            </div>

            <div>
              <SubHeading icon={<CreditCard className="h-4 w-4" />}>Preferred booking types</SubHeading>
              {editing.preferences ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {BOOKING_TYPE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-soft)] bg-white px-3.5 py-2 text-sm text-[color:var(--navy)]"
                    >
                      <input
                        type="checkbox"
                        name="bookingTypesOption"
                        value={option.value}
                        defaultChecked={(details.bookingTypes ?? []).includes(option.value)}
                        onChange={(event) => {
                          const form = event.currentTarget.form;

                          if (!form) {
                            return;
                          }

                          const selected = Array.from(
                            form.querySelectorAll<HTMLInputElement>(
                              'input[name="bookingTypesOption"]:checked'
                            )
                          ).map((input) => input.value);
                          const target = form.querySelector<HTMLInputElement>(
                            'input[name="bookingTypes"]'
                          );

                          if (target) {
                            target.value = selected.join(",");
                          }
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                  <input
                    type="hidden"
                    name="bookingTypes"
                    defaultValue={(details.bookingTypes ?? []).join(",")}
                  />
                </div>
              ) : (
                <>
                  <input
                    type="hidden"
                    name="bookingTypes"
                    value={(details.bookingTypes ?? []).join(",")}
                  />
                  <ChipRow items={bookingTypeLabels} tone="blue" emptyText="No booking types selected yet." />
                </>
              )}
            </div>

            <div>
              <SubHeading icon={<Clock3 className="h-4 w-4" />}>Preferred times</SubHeading>
              {editing.preferences ? (
                <Textarea
                  name="preferredTimes"
                  defaultValue={details.preferredTimes ?? ""}
                  placeholder={"Mon, Wed, Fri: 9:00 am - 12:00 pm\nTue, Thu: 1:00 pm - 4:00 pm"}
                  className="mt-2.5 min-h-20"
                />
              ) : (
                <>
                  <input type="hidden" name="preferredTimes" value={details.preferredTimes ?? ""} />
                  {preferredTimeRows.length > 0 ? (
                    <div className="mt-2.5 grid gap-1.5">
                      {preferredTimeRows.map((row, index) => (
                        <div key={index} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 text-sm">
                          <span className="text-[color:var(--text-soft)]">{row.label || "Times"}</span>
                          <span className="font-medium text-[color:var(--navy)]">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2.5 text-sm text-[color:var(--text-soft)]">Not set yet.</p>
                  )}
                </>
              )}
            </div>

            <label className="flex items-center gap-3 text-sm text-[color:var(--navy)]">
              <input
                type="checkbox"
                name="openToTravel"
                defaultChecked={ambassador.openToTravel}
                disabled={!editing.preferences}
              />
              {!editing.preferences && ambassador.openToTravel ? (
                <input type="hidden" name="openToTravel" value="on" />
              ) : null}
              I&apos;m open to travel beyond my main region if needed.
            </label>
          </div>

          <div>
            <SubHeading icon={<CalendarX2 className="h-4 w-4" />}>Weekly availability</SubHeading>
            <div className="mt-2.5 overflow-hidden rounded-[14px] border border-[color:var(--border-soft)]">
              <div className="grid grid-cols-7 divide-x divide-[color:var(--border-soft)] border-b border-[color:var(--border-soft)] bg-[#f6f9fd] text-center text-xs font-semibold text-[color:var(--navy)]">
                {WEEKDAYS.map((day) => (
                  <span key={day.key} className="px-1 py-2.5">
                    {day.label}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-[color:var(--border-soft)] bg-white text-center">
                {WEEKDAYS.map((day) => {
                  const value = details.weeklyAvailability?.[day.key] ?? "";

                  return editing.preferences ? (
                    <input
                      key={day.key}
                      name={`availability-${day.key}`}
                      defaultValue={value}
                      placeholder="9am-4pm"
                      className="w-full min-w-0 bg-white px-1 py-3 text-center text-[11px] text-[color:var(--navy)] outline-none placeholder:text-[color:var(--text-soft)]"
                    />
                  ) : (
                    <span
                      key={day.key}
                      className={cn(
                        "px-1 py-3 text-[11px] leading-4",
                        value
                          ? "font-medium text-[#1e4fae]"
                          : "text-[color:var(--text-soft)]"
                      )}
                    >
                      <input type="hidden" name={`availability-${day.key}`} value={value} />
                      {value || "Unavailable"}
                    </span>
                  );
                })}
              </div>
            </div>
            <p className="mt-2.5 flex items-center gap-2 rounded-[12px] bg-[#eef4fd] px-3 py-2 text-xs text-[#1e4fae]">
              <Info className="h-3.5 w-3.5 shrink-0" />
              All times shown are in NZST.
            </p>
          </div>

          <div className="grid content-start gap-6">
            <div>
              <SubHeading icon={<CalendarX2 className="h-4 w-4" />}>Unavailable dates</SubHeading>
              {editing.preferences ? (
                <Textarea
                  name="unavailableDates"
                  defaultValue={(details.unavailableDates ?? []).join(", ")}
                  placeholder="12-14 Jun 2026, 22 Jul 2026"
                  className="mt-2.5 min-h-16"
                />
              ) : (
                <>
                  <input
                    type="hidden"
                    name="unavailableDates"
                    value={(details.unavailableDates ?? []).join(",")}
                  />
                  <ChipRow
                    items={details.unavailableDates ?? []}
                    tone="red"
                    emptyText="No unavailable dates recorded."
                  />
                </>
              )}
            </div>
            <div>
              <SubHeading icon={<MessageSquareText className="h-4 w-4" />}>Additional note</SubHeading>
              {editing.preferences ? (
                <Textarea
                  name="availabilityNote"
                  defaultValue={details.availabilityNote ?? ""}
                  placeholder="Requires at least 7 days notice."
                  className="mt-2.5 min-h-16"
                />
              ) : (
                <>
                  <input
                    type="hidden"
                    name="availabilityNote"
                    value={details.availabilityNote ?? ""}
                  />
                  <p className="mt-2.5 text-sm leading-6 text-[color:var(--navy)]">
                    {details.availabilityNote || (
                      <span className="text-[color:var(--text-soft)]">Nothing added yet.</span>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </ProfileSection>

      {/* hidden bio passthrough so saving never wipes it */}
      <input type="hidden" name="bio" value={ambassador.bio ?? ""} />

      <div className="flex flex-wrap items-center justify-end gap-3 rounded-[22px] border border-[color:var(--border-soft)] bg-white/80 px-5 py-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setEditing({ personal: false, payment: false, tax: false, preferences: false });
            setFormVersion((version) => version + 1);
          }}
          className="rounded-[14px]"
        >
          Discard changes
        </Button>
        <Button
          type="submit"
          className="rounded-[14px] border-[#2563eb] bg-[#2563eb] text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:border-[#1d4fd7] hover:bg-[#1d4fd7]"
        >
          Save changes
        </Button>
      </div>
    </form>
  );
}

function HeaderStat({
  icon,
  iconClassName,
  label,
  value,
  hint
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 text-center">
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </div>
      <p className="mt-1 text-sm text-[color:var(--text-soft)]">{label}</p>
      <p className="max-w-full truncate text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {value}
      </p>
      {hint ? <p className="text-xs text-[color:var(--text-soft)]">{hint}</p> : null}
    </div>
  );
}

function SubHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
      <span className="text-[#1e4fae]">{icon}</span>
      {children}
    </p>
  );
}

function ProfileSection({
  title,
  editing,
  onToggle,
  children,
  className
}: {
  title: string;
  editing: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-panel rounded-[28px] p-5 md:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {title}
        </h2>
        <Button
          type="button"
          variant={editing ? "primary" : "secondary"}
          onClick={onToggle}
          className="min-h-[38px] rounded-[12px] px-3.5 py-1.5 text-xs"
        >
          <PencilLine className="h-3.5 w-3.5" />
          {editing ? "Editing" : "Edit"}
        </Button>
      </div>
      <div className="mt-4 grid gap-0.5">{children}</div>
    </section>
  );
}

function ProfileField({
  icon,
  label,
  editing,
  name,
  value,
  displayValue,
  input
}: {
  icon: ReactNode;
  label: string;
  editing: boolean;
  name: string;
  value: string;
  displayValue?: string;
  input?: ReactNode;
}) {
  if (editing && input) {
    return (
      <div className="grid gap-1.5 border-b border-[rgba(4,15,75,0.06)] py-3 last:border-0">
        <span className="flex items-center gap-2.5 text-sm text-[color:var(--text-soft)]">
          <span className="text-[color:var(--navy)]">{icon}</span>
          {label}
        </span>
        {input}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[rgba(4,15,75,0.06)] py-3 last:border-0">
      <span className="flex shrink-0 items-center gap-2.5 text-sm text-[color:var(--text-soft)]">
        <span className="text-[color:var(--navy)]">{icon}</span>
        {label}
      </span>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <span className="min-w-0 text-right text-sm font-medium leading-6 text-[color:var(--navy)]">
        {(displayValue ?? value) || <span className="font-normal text-[color:var(--text-soft)]">Not set yet</span>}
      </span>
    </div>
  );
}

function ChipRow({
  items,
  emptyText,
  tone
}: {
  items: string[];
  emptyText: string;
  tone: "green" | "blue" | "red";
}) {
  if (items.length === 0) {
    return <p className="mt-2.5 text-sm text-[color:var(--text-soft)]">{emptyText}</p>;
  }

  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold",
            tone === "green" && "bg-[color:var(--green-soft)] text-[#1d6f35]",
            tone === "blue" && "bg-[#e8f1fd] text-[#1e4fae]",
            tone === "red" && "bg-[#fdecec] text-[#b3372e]"
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
