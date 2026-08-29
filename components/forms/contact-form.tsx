"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  initialContactFormState,
  type ContactFormState
} from "@/lib/services/contact";
import { cn } from "@/lib/utils";

type ContactAction = (
  state: ContactFormState,
  formData: FormData
) => Promise<ContactFormState>;

export function ContactForm({ action }: { action: ContactAction }) {
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
          id="contact-name"
          label="Your name"
          error={state.fieldErrors?.name?.[0]}
        >
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={state.fieldErrors?.name ? "contact-name-error" : undefined}
          />
        </ContactField>

        <ContactField
          id="contact-email"
          label="Email address"
          error={state.fieldErrors?.email?.[0]}
        >
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? "contact-email-error" : undefined}
          />
        </ContactField>
      </div>

      <ContactField
        id="contact-school"
        label="School or organisation"
        hint="Optional"
        error={state.fieldErrors?.school?.[0]}
      >
        <Input
          id="contact-school"
          name="school"
          autoComplete="organization"
          maxLength={120}
          aria-invalid={Boolean(state.fieldErrors?.school)}
          aria-describedby={state.fieldErrors?.school ? "contact-school-error" : undefined}
        />
      </ContactField>

      <ContactField
        id="contact-subject"
        label="Subject"
        error={state.fieldErrors?.subject?.[0]}
      >
        <Input
          id="contact-subject"
          name="subject"
          required
          maxLength={120}
          aria-invalid={Boolean(state.fieldErrors?.subject)}
          aria-describedby={state.fieldErrors?.subject ? "contact-subject-error" : undefined}
        />
      </ContactField>

      <ContactField
        id="contact-message"
        label="How can we help?"
        error={state.fieldErrors?.message?.[0]}
      >
        <Textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={8}
          className="min-h-48 resize-y"
          aria-invalid={Boolean(state.fieldErrors?.message)}
          aria-describedby={state.fieldErrors?.message ? "contact-message-error" : undefined}
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
          className="min-h-[48px] rounded-[16px] border-[#149238] bg-[color:var(--green)] px-6 text-white shadow-[0_12px_28px_rgba(24,168,59,0.24)] hover:border-[#0f7c2e] hover:bg-[#128a30]"
        >
          Send message
          <Send className="h-4 w-4" aria-hidden="true" />
        </PendingSubmitButton>
      </div>
    </form>
  );
}

function ContactField({
  id,
  label,
  hint,
  error,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-[color:var(--navy)]">
          {label}
        </label>
        {hint ? <span className="text-xs text-[color:var(--text-soft)]">{hint}</span> : null}
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
