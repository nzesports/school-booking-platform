"use client";

import { useEffect, type ReactNode } from "react";
import { CheckCircle2, School, UserRound, X } from "lucide-react";

import {
  type AuthModalMode,
  type AuthModalRole
} from "@/components/auth/auth-modal-provider";
import { AuthField } from "@/components/auth/auth-field";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { BrandLockup } from "@/components/site/brand-lockup";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagMultiSelect } from "@/components/ui/tag-multi-select";
import { Textarea } from "@/components/ui/textarea";
import type { Region } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const loginMessages: Record<string, string> = {
  "auth-required": "Please log in to access that portal.",
  "account-inactive": "This account is inactive. Contact a super admin for help.",
  "ambassador-pending":
    "Your ambassador account is still waiting for staff approval. We'll email you when access is enabled.",
  "confirm-failed": "We couldn't verify that link. Try requesting a new password reset or sign in again.",
  "invalid-confirm-link": "That confirmation link is invalid or has expired.",
  "invalid-credentials": "The email or password was incorrect.",
  "profile-missing": "Your account exists, but the portal profile is missing. Please contact support.",
  "supabase-unavailable": "Authentication is not configured yet in this environment."
};

const signupMessages: Record<string, string> = {
  "invalid-school-signup":
    "Please complete every school account field and make sure the passwords match.",
  "invalid-ambassador-signup":
    "Please complete every ambassador field and make sure the passwords match.",
  "signup-failed": "We couldn't create that account right now. Please try again.",
  "supabase-unavailable": "Authentication is not configured yet in this environment."
};

const forgotMessages: Record<string, string> = {
  "invalid-email": "Please enter a valid email address.",
  "reset-failed": "We couldn't send that reset email. Please try again.",
  "supabase-unavailable": "Authentication is not configured yet in this environment."
};

type AuthAction = (formData: FormData) => void | Promise<void>;

export function AuthModalHost({
  mode,
  role,
  query,
  regions,
  loginAction,
  registerSchoolAction,
  registerAmbassadorAction,
  forgotPasswordAction,
  authEnabled,
  returnTo,
  closeAuth,
  openAuth
}: {
  mode: AuthModalMode | null;
  role: AuthModalRole;
  query: {
    application: string | null;
    checkEmail: string | null;
    error: string | null;
    loggedOut: string | null;
    reset: string | null;
    sent: string | null;
    verified: string | null;
  };
  regions: Region[];
  loginAction: AuthAction;
  registerSchoolAction: AuthAction;
  registerAmbassadorAction: AuthAction;
  forgotPasswordAction: AuthAction;
  authEnabled: boolean;
  returnTo: string;
  closeAuth: () => void;
  openAuth: (options: { mode: AuthModalMode; role?: AuthModalRole }) => void;
}) {
  useEffect(() => {
    if (!mode) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAuth();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeAuth, mode]);

  if (!mode) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-[rgba(4,15,75,0.44)] px-4 py-4 backdrop-blur-sm md:px-6 md:py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeAuth();
        }
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-auto grid w-full max-w-[1240px] overflow-hidden rounded-[36px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,252,0.98))] shadow-[0_34px_80px_rgba(11,24,77,0.22)] lg:max-h-[calc(100vh-3rem)] lg:grid-cols-[minmax(240px,0.6fr)_minmax(0,1.4fr)]"
      >
        <aside className="relative overflow-hidden border-b border-[rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(238,247,252,0.94))] p-6 md:p-7 lg:border-b-0 lg:border-r lg:p-8 xl:p-10">
          <div className="relative z-10 flex h-full flex-col">
            <BrandLockup subtitle="Secure portals" />
            <span className="section-kicker mt-7 w-fit">
              {mode === "login"
                ? "Portal access"
                : mode === "forgot"
                  ? "Password recovery"
                  : "Portal onboarding"}
            </span>
            <div className="mt-5 max-w-xl">
              <h2 className="max-w-[12ch] text-[2.5rem] font-semibold leading-[0.98] tracking-[-0.06em] text-[color:var(--navy)] md:text-[3rem]">
                {mode === "login"
                  ? "Log back into NZ Esports."
                  : mode === "forgot"
                    ? "Reset your password securely."
                    : role === "ambassador"
                      ? "Join the NZ Esports ambassador team."
                      : "Create the right account for your role."}
              </h2>
              <p className="mt-4 text-[0.98rem] leading-7 text-[color:var(--text-soft)]">
                {mode === "login"
                  ? "Use the email address linked to your school, ambassador, staff, or admin account."
                  : mode === "forgot"
                    ? "Enter your account email and we’ll send you a secure reset link."
                    : role === "ambassador"
                      ? "Apply to deliver sessions that inspire rangatahi and strengthen esports in Aotearoa."
                      : "Create a school account to access bookings, resources, updates, and more in one secure place."}
              </p>
              {mode === "signup" ? (
                <p className="mt-4 text-[0.98rem] leading-7 text-[color:var(--text-soft)]">
                  {role === "ambassador"
                    ? "Applications go through staff review before ambassador portal access is unlocked."
                    : "School accounts can move straight into the portal after email verification is complete."}
                </p>
              ) : null}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(71,201,106,0.12),transparent_32%),radial-gradient(circle_at_top_left,rgba(175,213,237,0.32),transparent_42%)]" />
          <div className="pointer-events-none absolute -bottom-16 left-[-10%] h-44 w-[70%] rotate-[-22deg] rounded-[40px] bg-[linear-gradient(135deg,rgba(4,15,75,0.08),rgba(175,213,237,0.18))]" />
        </aside>

        <div className="relative bg-white/78 p-6 md:p-7 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:p-8 xl:p-10">
          <button
            type="button"
            onClick={closeAuth}
            className="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[rgba(4,15,75,0.08)] bg-white/82 text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)] transition hover:bg-white"
            aria-label="Close authentication dialog"
          >
            <X className="h-4 w-4" />
          </button>

          {mode !== "forgot" ? (
            <nav className="mr-14 grid grid-cols-2 gap-2 rounded-full border border-[rgba(4,15,75,0.08)] bg-[rgba(247,250,252,0.92)] p-1.5">
              <button
                type="button"
                onClick={() => openAuth({ mode: "login" })}
                className={cn(
                  "inline-flex min-h-[46px] items-center justify-center rounded-full px-5 text-sm font-semibold transition",
                  mode === "login"
                    ? "bg-[linear-gradient(135deg,rgba(175,213,237,0.92),rgba(234,248,238,0.96))] text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                    : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
                )}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => openAuth({ mode: "signup", role })}
                className={cn(
                  "inline-flex min-h-[46px] items-center justify-center rounded-full px-5 text-sm font-semibold transition",
                  mode === "signup"
                    ? "bg-[linear-gradient(135deg,rgba(175,213,237,0.92),rgba(234,248,238,0.96))] text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                    : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
                )}
              >
                Sign up
              </button>
            </nav>
          ) : null}

          <div className={cn("mr-0", mode !== "forgot" && "mt-6 mr-14")}>
            {!authEnabled ? (
              <UnavailablePanel closeAuth={closeAuth} mode={mode} />
            ) : null}

            {authEnabled && mode === "login" ? (
              <LoginPanel
                query={query}
                returnTo={returnTo}
                loginAction={loginAction}
                openForgot={() => openAuth({ mode: "forgot" })}
                openSignup={() => openAuth({ mode: "signup", role: "school" })}
              />
            ) : null}

            {authEnabled && mode === "signup" ? (
              <SignupPanel
                role={role}
                query={query}
                regions={regions}
                returnTo={returnTo}
                registerSchoolAction={registerSchoolAction}
                registerAmbassadorAction={registerAmbassadorAction}
                openLogin={() => openAuth({ mode: "login" })}
                openRole={(nextRole) => openAuth({ mode: "signup", role: nextRole })}
              />
            ) : null}

            {authEnabled && mode === "forgot" ? (
              <ForgotPasswordPanel
                query={query}
                returnTo={returnTo}
                forgotPasswordAction={forgotPasswordAction}
                openLogin={() => openAuth({ mode: "login" })}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnavailablePanel({
  closeAuth,
  mode
}: {
  closeAuth: () => void;
  mode: AuthModalMode;
}) {
  const heading =
    mode === "signup"
      ? "Portal sign up is not connected yet."
      : mode === "forgot"
        ? "Password reset is not connected yet."
        : "Portal login is not connected yet.";

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
        Authentication setup
      </p>
      <h3 className="mt-2 text-[2.15rem] font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-[2.35rem]">
        {heading}
      </h3>
      <p className="mt-2 max-w-2xl text-[0.98rem] leading-7 text-[color:var(--text-soft)]">
        This local environment is still missing the Supabase authentication keys, so public portal
        sign up, login, and password recovery are paused for now.
      </p>

      <Banner tone="error">
        Add <code className="font-semibold">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-semibold">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable the
        live auth flow.
      </Banner>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={closeAuth}
          className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[rgba(4,15,75,0.12)] bg-white px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)] transition hover:bg-[#fbfdff]"
        >
          Continue browsing
        </button>
      </div>
    </>
  );
}

function LoginPanel({
  query,
  returnTo,
  loginAction,
  openForgot,
  openSignup
}: {
  query: {
    application: string | null;
    checkEmail: string | null;
    error: string | null;
    loggedOut: string | null;
    reset: string | null;
    sent: string | null;
    verified: string | null;
  };
  returnTo: string;
  loginAction: AuthAction;
  openForgot: () => void;
  openSignup: () => void;
}) {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
        Portal login
      </p>
      <h3 className="mt-2 text-[2.15rem] font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-[2.35rem]">
        Welcome back.
      </h3>

      {query.error && loginMessages[query.error] ? (
        <Banner tone="error">{loginMessages[query.error]}</Banner>
      ) : null}
      {query.checkEmail ? (
        <Banner tone="success">
          Check your inbox to verify your {query.checkEmail} account before signing in.
        </Banner>
      ) : null}
      {query.application ? (
        <Banner tone="success">
          Your ambassador application has been received and sent to the staff review queue.
        </Banner>
      ) : null}
      {query.verified ? (
        <Banner tone="success">
          Your email has been verified. If you signed up as an ambassador, staff approval is still
          required before portal access is enabled.
        </Banner>
      ) : null}
      {query.reset ? (
        <Banner tone="success">Your password has been updated. Please log in again.</Banner>
      ) : null}
      {query.loggedOut ? <Banner tone="success">You have been logged out.</Banner> : null}

      <form action={loginAction} className="mt-5 grid gap-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <AuthField label="Email">
          <Input name="email" type="email" placeholder="name@example.com" required />
        </AuthField>
        <AuthField label="Password">
          <PasswordInput name="password" placeholder="Enter your password" required />
        </AuthField>
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <button
            type="button"
            onClick={openForgot}
            className="font-semibold text-[color:var(--green)]"
          >
            Forgot password?
          </button>
          <button
            type="button"
            onClick={openSignup}
            className="font-semibold text-[color:var(--navy)]"
          >
            Need an account?
          </button>
        </div>
        <SubmitButton
          type="submit"
          pendingLabel="Signing in..."
          className="w-full justify-center"
        >
          Log in
        </SubmitButton>
      </form>
    </>
  );
}

function SignupPanel({
  role,
  query,
  regions,
  returnTo,
  registerSchoolAction,
  registerAmbassadorAction,
  openLogin,
  openRole
}: {
  role: AuthModalRole;
  query: {
    application: string | null;
    checkEmail: string | null;
    error: string | null;
    loggedOut: string | null;
    reset: string | null;
    sent: string | null;
    verified: string | null;
  };
  regions: Region[];
  returnTo: string;
  registerSchoolAction: AuthAction;
  registerAmbassadorAction: AuthAction;
  openLogin: () => void;
  openRole: (role: AuthModalRole) => void;
}) {
  const isAmbassador = role === "ambassador";

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
        {isAmbassador ? "Ambassador sign up" : "School sign up"}
      </p>
      <h3 className="mt-2 text-[2.15rem] font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-[2.35rem]">
        {isAmbassador
          ? "Apply to join the NZ Esports ambassador team."
          : "Set up your school portal account."}
      </h3>
      <p className="mt-2 max-w-2xl text-[0.98rem] leading-7 text-[color:var(--text-soft)]">
        {isAmbassador
          ? "Ambassador accounts require staff or admin approval before access is unlocked."
          : "Choose the account type that best fits your role to continue."}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <RoleCard
          active={!isAmbassador}
          title="School account"
          description="Direct portal access after verification."
          icon={<School className="h-6 w-6" />}
          onClick={() => openRole("school")}
        />
        <RoleCard
          active={isAmbassador}
          title="Ambassador application"
          description="Requires staff or admin approval before entry."
          icon={<UserRound className="h-6 w-6" />}
          onClick={() => openRole("ambassador")}
        />
      </div>

      {query.error && signupMessages[query.error] ? (
        <Banner tone="error">{signupMessages[query.error]}</Banner>
      ) : null}

      {isAmbassador ? (
        <form action={registerAmbassadorAction} className="mt-5 grid gap-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="grid gap-4 md:grid-cols-2">
            <AuthField label="Full name">
              <Input name="fullName" placeholder="Alex Tane" required />
            </AuthField>
            <AuthField label="Email">
              <Input name="email" type="email" placeholder="alex@example.com" required />
            </AuthField>
            <AuthField label="Phone">
              <Input name="phone" placeholder="+64 21 000 0000" required />
            </AuthField>
            <AuthField label="Primary region">
              <Select name="regionSlug" required defaultValue="">
                <option value="" disabled>
                  Select your region
                </option>
                {regions.map((region) => (
                  <option key={region.id} value={region.slug}>
                    {region.name}
                  </option>
                ))}
              </Select>
            </AuthField>
          </div>

          <AuthField label="Presentation or facilitation experience">
            <Textarea
              name="experience"
              className="min-h-24"
              placeholder="Tell us about your presenting, education, youth work, esports, or facilitation experience."
              required
            />
          </AuthField>

          <div className="grid gap-4 md:grid-cols-2">
            <AuthField label="Who referred you?" hint="Optional">
              <Input name="referredBy" placeholder="Name of the person or organisation" />
            </AuthField>
            <label className="flex items-center gap-3 rounded-[20px] border border-[color:var(--border-soft)] bg-white/86 px-4 py-4 text-sm text-[color:var(--text-soft)]">
              <input type="checkbox" name="openToTravel" />
              I’m open to travel beyond my main region if needed.
            </label>
          </div>

          <AuthField label="Travel regions" hint="Select all that apply">
            <TagMultiSelect
              name="travelRegions"
              options={regions.map((region) => ({
                label: region.name,
                value: region.slug
              }))}
              placeholder="Choose regions and they will appear as tags"
            />
          </AuthField>

          <div className="grid gap-4 md:grid-cols-2">
            <AuthField label="Password">
              <PasswordInput name="password" placeholder="Create a password" required />
            </AuthField>
            <AuthField label="Confirm password">
              <PasswordInput name="confirmPassword" placeholder="Repeat your password" required />
            </AuthField>
          </div>

          <SubmitButton
            type="submit"
            pendingLabel="Submitting application..."
            className="mt-2 w-full justify-center"
          >
            Submit ambassador application
          </SubmitButton>
        </form>
      ) : (
        <form action={registerSchoolAction} className="mt-5 grid gap-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="grid gap-4 md:grid-cols-2">
            <AuthField label="School name">
              <Input name="schoolName" placeholder="e.g. Harbour Secondary College" required />
            </AuthField>
            <AuthField label="Primary contact name">
              <Input name="contactName" placeholder="e.g. Jules Morgan" required />
            </AuthField>
            <AuthField label="Contact email">
              <Input name="email" type="email" placeholder="e.g. jules@school.nz" required />
            </AuthField>
            <AuthField label="Phone number">
              <Input name="phone" placeholder="e.g. +64 21 555 123" required />
            </AuthField>
            <AuthField label="Region">
              <Select name="regionSlug" required defaultValue="">
                <option value="" disabled>
                  Select your region
                </option>
                {regions.map((region) => (
                  <option key={region.id} value={region.slug}>
                    {region.name}
                  </option>
                ))}
              </Select>
            </AuthField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AuthField label="Password">
              <PasswordInput name="password" placeholder="Create a password" required />
            </AuthField>
            <AuthField label="Confirm password">
              <PasswordInput name="confirmPassword" placeholder="Repeat your password" required />
            </AuthField>
          </div>

          <label className="flex items-start gap-3 rounded-[20px] border border-[color:var(--border-soft)] bg-white/86 px-4 py-4 text-sm text-[color:var(--text-soft)]">
            <input type="checkbox" name="marketingConsent" defaultChecked className="mt-0.5" />
            Keep me updated about future NZ Esports school resources and presentation news.
          </label>

          <SubmitButton
            type="submit"
            pendingLabel="Creating school account..."
            className="mt-2 w-full justify-center"
          >
            Create school account
          </SubmitButton>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-[color:var(--text-soft)]">
        Already have an account?{" "}
        <button
          type="button"
          onClick={openLogin}
          className="font-semibold text-[color:var(--navy)]"
        >
          Log in
        </button>
      </p>
    </>
  );
}

function ForgotPasswordPanel({
  query,
  returnTo,
  forgotPasswordAction,
  openLogin
}: {
  query: {
    application: string | null;
    checkEmail: string | null;
    error: string | null;
    loggedOut: string | null;
    reset: string | null;
    sent: string | null;
    verified: string | null;
  };
  returnTo: string;
  forgotPasswordAction: AuthAction;
  openLogin: () => void;
}) {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
        Forgot password
      </p>
      <h3 className="mt-2 text-[2.15rem] font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-[2.35rem]">
        Reset your password.
      </h3>
      <p className="mt-2 max-w-2xl text-[0.98rem] leading-7 text-[color:var(--text-soft)]">
        Enter the email address for your school, ambassador, staff, or admin account and we’ll
        send you a secure reset link.
      </p>

      {query.error && forgotMessages[query.error] ? (
        <Banner tone="error">{forgotMessages[query.error]}</Banner>
      ) : null}
      {query.sent ? (
        <Banner tone="success">Password reset instructions were sent to {query.sent}.</Banner>
      ) : null}

      <form action={forgotPasswordAction} className="mt-5 grid gap-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <AuthField label="Email">
          <Input name="email" type="email" placeholder="name@example.com" required />
        </AuthField>
        <SubmitButton
          type="submit"
          pendingLabel="Sending reset link..."
          className="w-full justify-center"
        >
          Send reset link
        </SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-[color:var(--text-soft)]">
        Remembered your password?{" "}
        <button
          type="button"
          onClick={openLogin}
          className="font-semibold text-[color:var(--navy)]"
        >
          Back to login
        </button>
      </p>
    </>
  );
}

function RoleCard({
  active,
  title,
  description,
  icon,
  onClick
}: {
  active: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-h-[112px] items-center gap-4 rounded-[22px] border px-4 py-4 text-left transition",
        active
          ? "border-[rgba(24,168,59,0.45)] bg-[linear-gradient(135deg,rgba(234,248,238,0.86),rgba(238,247,252,0.92))] shadow-[0_16px_32px_rgba(11,24,77,0.08)]"
          : "border-[color:rgba(4,15,75,0.1)] bg-white/78 hover:bg-white"
      )}
    >
      <div
        className={cn(
          "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
          active
            ? "bg-[linear-gradient(135deg,rgba(234,248,238,1),rgba(175,213,237,0.42))] text-[color:var(--green)]"
            : "bg-[rgba(238,247,252,0.9)] text-[color:var(--navy)]"
        )}
      >
        {icon}
      </div>
      <div className="pr-8">
        <p className="text-base font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {title}
        </p>
        <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">{description}</p>
      </div>
      <span className="absolute right-4 top-4">
        {active ? (
          <CheckCircle2 className="h-5 w-5 text-[color:var(--green)]" />
        ) : (
          <span className="block h-5 w-5 rounded-full border border-[rgba(4,15,75,0.22)]" />
        )}
      </span>
    </button>
  );
}

function Banner({
  tone,
  children
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "mt-4 rounded-[22px] px-4 py-4 text-sm leading-7",
        tone === "success"
          ? "border border-[rgba(24,168,59,0.16)] bg-white/76 text-[color:var(--navy)]"
          : "border border-[rgba(180,35,24,0.14)] bg-[#fff6f6] text-[#9d2424]"
      )}
    >
      {children}
    </p>
  );
}
