"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  initialContactFormState,
  type ContactFormState,
  type ContactFormValues
} from "@/lib/services/contact";
import { cn } from "@/lib/utils";

type ContactAction = (
  state: ContactFormState,
  formData: FormData
) => Promise<ContactFormState>;

export function ContactForm({
  action,
  defaultValues,
  idPrefix = "contact",
  submitLabel = "Send message"
}: {
  action: ContactAction;
  // Prefills the fields, e.g. with details a school already entered while booking.
  defaultValues?: Partial<ContactFormValues>;
  // Keeps ids unique when the form is rendered somewhere other than /contact.
  idPrefix?: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialContactFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const formStartedAtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  function markFormStarted() {
    const field = formStartedAtRef.current;

    if (field && !field.value) {
      field.value = Date.now().toString();
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onFocusCapture={markFormStarted}
      onPointerDownCapture={markFormStarted}
      className="grid gap-5"
      noValidate
    >
      <input ref={formStartedAtRef} type="hidden" name="startedAt" />
      <input
        className="hidden"
        name="website2"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <ContactField
          id={`${idPrefix}-name`}
          label="Your name"
          error={state.fieldErrors?.name?.[0]}
        >
          <Input
            id={`${idPrefix}-name`}
            name="name"
            defaultValue={defaultValues?.name}
            autoComplete="name"
            required
            maxLength={80}
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={state.fieldErrors?.name ? `${idPrefix}-name-error` : undefined}
          />
        </ContactField>

        <ContactField
          id={`${idPrefix}-email`}
          label="Email address"
          error={state.fieldErrors?.email?.[0]}
        >
          <Input
            id={`${idPrefix}-email`}
            name="email"
            defaultValue={defaultValues?.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? `${idPrefix}-email-error` : undefined}
          />
        </ContactField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ContactField
          id={`${idPrefix}-school`}
          label="School or organisation"
          error={state.fieldErrors?.school?.[0]}
        >
          <Input
            id={`${idPrefix}-school`}
            name="school"
            defaultValue={defaultValues?.school}
            autoComplete="organization"
            required
            maxLength={120}
            aria-invalid={Boolean(state.fieldErrors?.school)}
            aria-describedby={state.fieldErrors?.school ? `${idPrefix}-school-error` : undefined}
          />
        </ContactField>

        <ContactField
          id={`${idPrefix}-phone`}
          label="Phone (optional)"
          optional
          error={state.fieldErrors?.phone?.[0]}
        >
          <Input
            id={`${idPrefix}-phone`}
            name="phone"
            type="tel"
            defaultValue={defaultValues?.phone}
            autoComplete="tel"
            maxLength={50}
            aria-invalid={Boolean(state.fieldErrors?.phone)}
            aria-describedby={state.fieldErrors?.phone ? `${idPrefix}-phone-error` : undefined}
          />
        </ContactField>
      </div>

      <ContactField
        id={`${idPrefix}-subject`}
        label="Subject"
        error={state.fieldErrors?.subject?.[0]}
      >
        <Input
          id={`${idPrefix}-subject`}
          name="subject"
          defaultValue={defaultValues?.subject}
          required
          maxLength={120}
          aria-invalid={Boolean(state.fieldErrors?.subject)}
          aria-describedby={state.fieldErrors?.subject ? `${idPrefix}-subject-error` : undefined}
        />
      </ContactField>

      <ContactField
        id={`${idPrefix}-message`}
        label="How can we help?"
        error={state.fieldErrors?.message?.[0]}
      >
        <Textarea
          id={`${idPrefix}-message`}
          name="message"
          defaultValue={defaultValues?.message}
          required
          minLength={10}
          maxLength={5000}
          rows={8}
          className="min-h-48 resize-y"
          aria-invalid={Boolean(state.fieldErrors?.message)}
          aria-describedby={state.fieldErrors?.message ? `${idPrefix}-message-error` : undefined}
        />
      </ContactField>

      {state.message ? (
        <p
          className={cn(
            "rounded-[16px] px-4 py-3 text-sm font-semibold",
            state.status === "success"
              ? "bg-[color:var(--green-soft)] text-[#117a2e]"
              : "bg-[#fff4f2] text-[#a6352c]"
          )}
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}

      <div>
        <PendingSubmitButton
          type="submit"
          pendingLabel="Sending message..."
          className="border-[#149238] bg-[color:var(--green)] text-white shadow-[0_3px_10px_rgba(24,168,59,0.24)] hover:border-[#0f7c2e] hover:bg-[#128a30]"
        >
          {submitLabel}
          <Send className="h-4 w-4" aria-hidden="true" />
        </PendingSubmitButton>
      </div>
    </form>
  );
}

function ContactField({
  id,
  label,
  optional = false,
  error,
  children
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold text-[color:var(--navy)]">
          {label}
        </label>
        {optional ? null : (
          <>
            <span className="font-bold text-[#c7352c]" aria-hidden="true">
              *
            </span>
            <span className="sr-only">Required</span>
          </>
        )}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm font-medium text-[#a6352c]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
