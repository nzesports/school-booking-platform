import type { Metadata } from "next";
import { Clock3, MapPin, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { submitContactFormAction } from "@/app/contact/actions";
import { ContactForm } from "@/components/forms/contact-form";

export const metadata: Metadata = {
  title: "Contact Us | NZ Esports School Presentations",
  description: "Send the NZ Esports school presentations team a message."
};

export default function ContactPage() {
  return (
    <main className="public-stack">
      <section className="public-band relative overflow-hidden bg-[linear-gradient(135deg,#eefbf5_0%,#eef8fc_52%,#f5f8fc_100%)]">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(24,168,59,0.14),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-40 right-[-8rem] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(175,213,237,0.32),transparent_70%)]" />
        <div className="site-shell relative grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-xl pt-2">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Contact us
            </p>
            <h1 className="mt-3 text-5xl font-semibold leading-[1.02] tracking-[-0.05em] text-[color:var(--navy)] md:text-6xl">
              Let&apos;s start a conversation.
            </h1>
            <p className="mt-6 text-lg leading-8 text-[color:var(--text-soft)]">
              Have a question about presentations, bookings, partnerships or anything else? Send
              our team a message and we&apos;ll point you in the right direction.
            </p>

            <div className="mt-8 grid gap-4 text-sm text-[color:var(--text-soft)]">
              <ContactDetail icon={Clock3}>
                We usually reply within two working days.
              </ContactDetail>
              <ContactDetail icon={MapPin}>
                Supporting schools across Aotearoa New Zealand.
              </ContactDetail>
            </div>
          </div>

          <div className="surface-panel rounded-[32px] p-6 shadow-[0_22px_54px_rgba(11,24,77,0.1)] sm:p-8 lg:p-10">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
              Write to us
            </h2>
            <p className="mb-7 mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
              All fields are required.
            </p>
            <ContactForm action={submitContactFormAction} />
          </div>
        </div>
      </section>
    </main>
  );
}

function ContactDetail({
  icon: Icon,
  children
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--green-soft)] text-[color:var(--green)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="leading-6">{children}</span>
    </div>
  );
}
