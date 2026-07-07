"use client";

import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  Grid2x2,
  Info,
  Mail,
  PencilLine,
  Plus,
  School2,
  Search,
  Send,
  UsersRound
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { EmailEditor } from "@/components/ui/email-editor";
import { Button } from "@/components/ui/button";
import type { EmailTemplateSummary } from "@/lib/domain/types";
import { renderBrandedEmail } from "@/lib/services/email-layout";
import {
  EMAIL_SAMPLE_VALUES,
  substituteSampleValues
} from "@/lib/services/email-samples";
import { cn } from "@/lib/utils";

const PLACEHOLDERS = Object.keys(EMAIL_SAMPLE_VALUES);

const CATEGORIES = ["All", "Schools", "Ambassadors", "Finance", "System"] as const;

type Category = (typeof CATEGORIES)[number];

function templateCategory(key: string): Exclude<Category, "All"> {
  if (key.includes("invoice") || key.includes("payment")) {
    return "Finance";
  }

  if (key.startsWith("ambassador")) {
    return "Ambassadors";
  }

  if (key.startsWith("school") || key.includes("booking")) {
    return "Schools";
  }

  return "System";
}

function templateKind(key: string) {
  if (key.includes("booking")) return "Booking";
  if (key.includes("feedback")) return "Feedback";
  if (key.includes("reminder")) return "Reminder";
  if (key.includes("welcome")) return "Onboarding";
  if (key.includes("application") || key.includes("approved")) return "Application";
  if (key.includes("invoice") || key.includes("payment")) return "Invoice";
  return "Notification";
}

const categoryStyles: Record<Exclude<Category, "All">, { icon: ReactNode; className: string }> = {
  Schools: { icon: <School2 className="h-4 w-4" />, className: "bg-[#e8f1fd] text-[#2563eb]" },
  Ambassadors: {
    icon: <UsersRound className="h-4 w-4" />,
    className: "bg-[#eaf8ee] text-[#117a2e]"
  },
  Finance: {
    icon: <CircleDollarSign className="h-4 w-4" />,
    className: "bg-[#fff5df] text-[#b7791f]"
  },
  System: { icon: <Bell className="h-4 w-4" />, className: "bg-[#ece9ff] text-[#5b4fc0]" }
};

export function EmailTemplatesWorkspace({
  templates,
  saveAction,
  sendTestAction,
  createAction
}: {
  templates: EmailTemplateSummary[];
  saveAction: (formData: FormData) => void | Promise<void>;
  sendTestAction: (formData: FormData) => void | Promise<void>;
  createAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesQuery =
        !normalized ||
        `${template.subject} ${template.key}`.toLowerCase().includes(normalized);
      const matchesCategory =
        category === "All" || templateCategory(template.key) === category;

      return matchesQuery && matchesCategory;
    });
  }, [templates, query, category]);

  const selected =
    templates.find((template) => template.id === selectedId) ?? filtered[0] ?? templates[0];
  const activeCount = templates.filter((template) => template.status === "active").length;
  const draftCount = templates.length - activeCount;
  const categoryCount = new Set(templates.map((template) => templateCategory(template.key)))
    .size;

  return (
    <div className="grid gap-5">
      <p className="flex items-start gap-2.5 rounded-[16px] bg-[#eef4fd] px-4 py-3 text-sm font-medium leading-6 text-[#1e4fae]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Every email is wrapped in the NZ Esports branded header and footer automatically.
          The <strong>confirm your email</strong> and <strong>reset your password</strong>{" "}
          emails are sent by Supabase Auth and are customised in the Supabase dashboard
          (Authentication → Emails), not here.
        </span>
      </p>

      {/* ------------------------------------------------ stat tiles + create */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-4 xl:grid-cols-4">
          <StatTile
            icon={<Mail className="h-5 w-5" />}
            iconClassName="bg-[#eaf8ee] text-[#117a2e]"
            label="Active templates"
            value={String(activeCount)}
            hint="Published and in use"
          />
          <StatTile
            icon={<PencilLine className="h-5 w-5" />}
            iconClassName="bg-[#fff5df] text-[#b7791f]"
            label="Drafts"
            value={String(draftCount)}
            hint="Fall back to built-in wording"
          />
          <StatTile
            icon={<Grid2x2 className="h-5 w-5" />}
            iconClassName="bg-[#e8f1fd] text-[#2563eb]"
            label="Categories"
            value={String(categoryCount)}
            hint="School, Ambassador, Finance, System"
          />
          <StatTile
            icon={<Send className="h-5 w-5" />}
            iconClassName="bg-[#ece9ff] text-[#5b4fc0]"
            label="Total templates"
            value={String(templates.length)}
            hint="Across all platform emails"
          />
        </div>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[46px] rounded-[14px] border-[#149238] bg-[color:var(--green)] px-4 text-white shadow-[0_12px_28px_rgba(24,168,59,0.24)] hover:border-[#0f7c2e] hover:bg-[#128a30]"
        >
          <Plus className="h-4 w-4" />
          Create template
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        {/* ------------------------------------------------ template library */}
        <div className="surface-panel h-fit min-w-0 overflow-hidden rounded-[22px] p-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
            Template library
          </h2>

          <label className="mt-3 flex min-h-[44px] items-center gap-2.5 rounded-[13px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm text-[color:var(--navy)]">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates..."
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                className={cn(
                  "inline-flex min-h-[32px] items-center rounded-full border px-3 text-xs font-semibold transition",
                  option === category
                    ? "border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                    : "border-[color:var(--border-soft)] bg-white text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="mt-3 grid min-w-0 gap-1">
            {filtered.map((template) => {
              const templateCat = templateCategory(template.key);
              const style = categoryStyles[templateCat];
              const isSelected = template.id === selected?.id;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(template.id);
                    setTab("editor");
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-[14px] px-3 py-3 text-left transition",
                    isSelected
                      ? "bg-[color:var(--green-soft)] shadow-[inset_3px_0_0_var(--green)]"
                      : "hover:bg-[color:var(--blue-soft)]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      style.className
                    )}
                  >
                    {style.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        isSelected ? "text-[#117a2e]" : "text-[color:var(--navy)]"
                      )}
                    >
                      {template.subject}
                    </span>
                    <span className="block truncate text-xs text-[color:var(--text-soft)]">
                      {templateCat} · {templateKind(template.key)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      template.status === "active"
                        ? "bg-[#eaf8ee] text-[#117a2e]"
                        : "bg-[#fff5df] text-[#9a5a00]"
                    )}
                  >
                    {template.status === "active" ? "Active" : "Draft"}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-sm text-[color:var(--text-soft)]">
                No templates match that search.
              </p>
            ) : null}
          </div>

          <p className="mt-3 border-t border-[color:var(--border-soft)] px-1 pt-3 text-xs text-[color:var(--text-soft)]">
            Showing {filtered.length} of {templates.length} templates
          </p>
        </div>

        {/* ------------------------------------------------ editor panel */}
        {selected ? (
          <div className="surface-panel h-fit rounded-[22px]" key={selected.id}>
            <div className="flex items-center gap-1 border-b border-[color:var(--border-soft)] px-5 pt-3">
              {(["editor", "preview"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTab(option)}
                  className={cn(
                    "border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold transition",
                    tab === option
                      ? "border-[color:var(--green)] text-[#117a2e]"
                      : "border-transparent text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                  )}
                >
                  {option === "editor" ? "Editor" : "Preview"}
                </button>
              ))}
              <form action={sendTestAction} className="ml-auto pb-2">
                <input type="hidden" name="templateKey" value={selected.key} />
                <button
                  type="submit"
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-[12px] border border-[#c4dbfb] bg-white px-3 text-xs font-semibold text-[#1e4fae] transition hover:bg-[#f4f8ff]"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send test to me
                </button>
              </form>
            </div>

            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--green)]">
                {selected.key}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                  {selected.subject}
                </h2>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase",
                    selected.status === "active"
                      ? "bg-[#eaf8ee] text-[#117a2e]"
                      : "bg-[#fff5df] text-[#9a5a00]"
                  )}
                >
                  {selected.status === "active" ? "Active" : "Draft"}
                </span>
                <span className="rounded-full bg-[#eef2f8] px-2.5 py-0.5 text-[11px] font-bold uppercase text-[color:var(--text-soft)]">
                  {templateCategory(selected.key)}
                </span>
                <span className="rounded-full bg-[#eef2f8] px-2.5 py-0.5 text-[11px] font-bold uppercase text-[color:var(--text-soft)]">
                  Transactional
                </span>
              </div>

              {tab === "preview" ? (
                <div className="mt-4 overflow-hidden rounded-[18px] border border-[color:var(--border-soft)]">
                  <iframe
                    title="Email preview"
                    srcDoc={renderBrandedEmail(substituteSampleValues(selected.bodyHtml ?? ""))}
                    className="h-[640px] w-full bg-[#f4f7fb]"
                    sandbox=""
                  />
                </div>
              ) : (
                <form action={saveAction} className="mt-4 grid gap-4">
                  <input type="hidden" name="id" value={selected.id} />
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                      Subject
                    </span>
                    <input
                      name="subject"
                      defaultValue={selected.subject}
                      required
                      className="min-h-[44px] w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm text-[color:var(--navy)] outline-none"
                    />
                  </label>

                  <div className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                      Email body
                    </span>
                    <EmailEditor
                      name="bodyHtml"
                      defaultValue={selected.bodyHtml ?? ""}
                      placeholders={PLACEHOLDERS}
                    />
                    <p className="text-xs leading-5 text-[color:var(--text-soft)]">
                      The branded header, footer, unsubscribe link, and website links are added
                      automatically — only write the message itself. Images must be hosted
                      https links (max 560px wide) so email clients don&apos;t block them.
                    </p>
                  </div>

                  <details className="rounded-[14px] border border-[color:var(--border-soft)] bg-white/80 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[color:var(--navy)]">
                      Plain text version (optional)
                    </summary>
                    <textarea
                      name="bodyText"
                      defaultValue={selected.bodyText ?? ""}
                      className="mt-3 min-h-24 w-full rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3.5 py-2.5 text-sm outline-none"
                    />
                  </details>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-[color:var(--navy)]">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={selected.status === "active"}
                        className="h-4 w-4 accent-[color:var(--green)]"
                      />
                      Active (drafts fall back to the built-in wording)
                    </label>
                    <Button
                      type="submit"
                      className="min-h-[42px] rounded-[13px] border-[#149238] bg-[color:var(--green)] px-5 text-white hover:border-[#0f7c2e] hover:bg-[#128a30]"
                    >
                      Save changes
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          <div className="surface-panel rounded-[22px] p-8 text-sm text-[color:var(--text-soft)]">
            No email templates found yet.
          </div>
        )}
      </div>

      {/* ------------------------------------------------ create dialog */}
      {createOpen
        ? createPortal(
            <BookingDialogShell
              kicker="Email templates"
              title="Create a new template"
              description="The template key is generated from the name. Emails only send when a platform event uses that key — custom templates are ready for future events."
              onClose={() => setCreateOpen(false)}
              maxWidthClassName="max-w-[760px]"
              overlayClassName="z-[80]"
              compact
            >
              <form action={createAction} className="mt-5 grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                      Template name
                    </span>
                    <input
                      name="name"
                      placeholder="e.g. Payment processed"
                      required
                      className="min-h-[44px] w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm text-[color:var(--navy)] outline-none"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                      Subject
                    </span>
                    <input
                      name="subject"
                      placeholder="e.g. Your payment is on its way"
                      required
                      className="min-h-[44px] w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm text-[color:var(--navy)] outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                    Email body
                  </span>
                  <EmailEditor name="bodyHtml" placeholders={PLACEHOLDERS} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-[color:var(--navy)]">
                    <input type="checkbox" name="isActive" className="h-4 w-4 accent-[color:var(--green)]" />
                    Activate immediately
                  </label>
                  <Button
                    type="submit"
                    className="min-h-[44px] rounded-[13px] border-[#149238] bg-[color:var(--green)] px-5 text-white hover:border-[#0f7c2e] hover:bg-[#128a30]"
                  >
                    Create template
                  </Button>
                </div>
              </form>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </div>
  );
}

function StatTile({
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
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-4">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          iconClassName
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-[color:var(--text-soft)]">{label}</span>
        <span className="block text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value}
        </span>
        <span className="block truncate text-[11px] text-[color:var(--text-soft)]">{hint}</span>
      </span>
    </div>
  );
}
