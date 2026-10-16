"use client";

import { ArrowLeft, UsersRound } from "lucide-react";

import { submitContactFormAction } from "@/app/contact/actions";
import { ContactForm } from "@/components/forms/contact-form";
import { Button } from "@/components/ui/button";
import { MINIMUM_IN_PERSON_STUDENTS } from "@/lib/domain/booking-rules";
import type { ContactFormValues } from "@/lib/services/contact";

// Shown instead of the booking form when a school has fewer students than the
// in-person minimum. Sends a website enquiry to the team for the Schools
// Coordinator, prefilled with whatever the school already entered.
export function BookingCoordinatorPanel({
  defaultValues,
  onBack
}: {
  defaultValues: Partial<ContactFormValues>;
  onBack: () => void;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-[32px] border border-[rgba(164,202,227,0.48)] bg-[linear-gradient(180deg,rgba(248,252,255,0.96),rgba(255,255,255,0.98))] shadow-[0_30px_68px_rgba(11,24,77,0.12)]">
      <div className="px-5 py-5 md:px-7 lg:px-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(164,202,227,0.28)] text-[color:var(--navy)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.62)]">
            <UsersRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Booking for fewer than {MINIMUM_IN_PERSON_STUDENTS} students?
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--text-soft)]">
              Our in-person presentations are designed for groups of {MINIMUM_IN_PERSON_STUDENTS}{" "}
              or more students. For smaller groups, our Schools Coordinator will work with you
              directly to find an option that suits your school. Send us a few details below and
              they&apos;ll be in touch shortly.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <ContactForm
            action={submitContactFormAction}
            defaultValues={defaultValues}
            idPrefix="coordinator"
            submitLabel="Send to our Schools Coordinator"
          />
        </div>
      </div>

      <div className="border-t border-[rgba(4,15,75,0.08)] px-5 py-4 md:px-7 lg:px-8">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to booking
        </Button>
      </div>
    </div>
  );
}
