"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { buildAuthConfirmUrl, buildPublicAuthPath, portalPathForRole } from "@/lib/services/auth";
import { addContactToTeachersList } from "@/lib/services/brevo-contacts";
import {
  sendAmbassadorApplicationReceivedEmail,
  sendSchoolWelcomeEmail
} from "@/lib/services/email-triggers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { splitCommaList } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const schoolSignupSchema = z
  .object({
    schoolName: z.string().min(2),
    contactName: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(5),
    regionSlug: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    marketingConsent: z.boolean().optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

const ambassadorSignupSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(5),
    regionSlug: z.string().min(1),
    experience: z.string().min(20),
    referredBy: z.string().max(160).optional(),
    openToTravel: z.boolean().optional(),
    travelRegions: z.string().optional(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

async function resolveLoginRedirect() {
  const supabase = await createClient();

  if (!supabase) {
    return "/login?error=supabase-unavailable";
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return "/login?error=profile-missing";
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return "/login?error=account-inactive";
  }

  if (profile.role === "ambassador") {
    // Use the service-role client so the approval check never depends on the
    // ambassador's own RLS visibility of their profile row.
    const adminClient = createAdminClient();
    const { data: ambassador } = await (adminClient ?? supabase)
      .from("ambassador_profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ambassador?.status !== "approved") {
      await supabase.auth.signOut();
      return "/login?error=ambassador-pending";
    }
  }

  return portalPathForRole(profile.role);
}

function returnToPath(formData: FormData) {
  return String(formData.get("returnTo") || "/");
}

export type SignupFormState = {
  error: string;
  values: Record<string, string>;
  attempt: number;
} | null;

function signupIssueMessage(error: z.ZodError, fieldMessages: Record<string, string>) {
  const issue = error.issues[0];
  const field = String(issue?.path[0] ?? "");

  if (field === "confirmPassword" && issue?.code === "custom") {
    return "The passwords don't match — please re-enter them.";
  }

  if (field === "password" || field === "confirmPassword") {
    return "Passwords need to be at least 8 characters. Please re-enter them.";
  }

  return fieldMessages[field] ?? "Please complete every field and make sure the passwords match.";
}

function isEmailTaken(
  error: { message: string } | null,
  user: { identities?: unknown[] | null } | null
) {
  if (error) {
    return /already (been )?registered|already exists/i.test(error.message);
  }

  // Supabase obfuscates sign-ups for existing accounts by returning a user
  // with no identities instead of an error.
  return Boolean(user) && (user?.identities?.length ?? 0) === 0;
}

const schoolSignupFieldMessages: Record<string, string> = {
  schoolName: "Enter your school name.",
  contactName: "Enter the primary contact name.",
  email: "Enter a valid email address.",
  phone: "Enter a valid phone number.",
  regionSlug: "Select your region."
};

const ambassadorSignupFieldMessages: Record<string, string> = {
  fullName: "Enter your full name.",
  email: "Enter a valid email address.",
  phone: "Enter a valid phone number.",
  regionSlug: "Select your primary region.",
  experience: "Tell us a little more about your experience — at least 20 characters."
};

export async function registerSchoolAccountAction(
  prevState: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  const supabase = await createClient();
  const returnTo = returnToPath(formData);
  const attempt = (prevState?.attempt ?? 0) + 1;
  const values = {
    schoolName: String(formData.get("schoolName") || ""),
    contactName: String(formData.get("contactName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    regionSlug: String(formData.get("regionSlug") || ""),
    marketingConsent: formData.get("marketingConsent") === "on" ? "on" : ""
  };

  if (!supabase) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "signup",
        role: "school",
        error: "supabase-unavailable"
      })
    );
  }

  const parsed = schoolSignupSchema.safeParse({
    ...values,
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirmPassword") || ""),
    marketingConsent: values.marketingConsent === "on"
  });

  if (!parsed.success) {
    return {
      error: signupIssueMessage(parsed.error, schoolSignupFieldMessages),
      values,
      attempt
    };
  }

  const { error, data } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: buildAuthConfirmUrl("/school"),
      data: {
        role: "school",
        full_name: parsed.data.contactName,
        phone: parsed.data.phone,
        school_name: parsed.data.schoolName,
        region_slug: parsed.data.regionSlug,
        marketing_consent: parsed.data.marketingConsent ?? false
      }
    }
  });

  if (isEmailTaken(error, data?.user ?? null)) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "login",
        error: "email-exists"
      })
    );
  }

  if (error) {
    return {
      error: "We couldn't create that account right now. Please try again.",
      values,
      attempt
    };
  }

  void sendSchoolWelcomeEmail({
    contactEmail: parsed.data.email,
    contactName: parsed.data.contactName,
    schoolName: parsed.data.schoolName
  }).catch(() => {});

  if (parsed.data.marketingConsent) {
    void addContactToTeachersList({
      email: parsed.data.email,
      name: parsed.data.contactName,
      schoolName: parsed.data.schoolName
    }).catch(() => {});
  }

  if (data.session) {
    redirect("/school");
  }

  redirect(
    buildPublicAuthPath(returnTo, {
      auth: "login",
      checkEmail: "school"
    })
  );
}

export async function registerAmbassadorAccountAction(
  prevState: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  const supabase = await createClient();
  const returnTo = returnToPath(formData);
  const attempt = (prevState?.attempt ?? 0) + 1;
  const values = {
    fullName: String(formData.get("fullName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    regionSlug: String(formData.get("regionSlug") || ""),
    experience: String(formData.get("experience") || ""),
    referredBy: String(formData.get("referredBy") || ""),
    openToTravel: formData.get("openToTravel") === "on" ? "on" : "",
    travelRegions: String(formData.get("travelRegions") || "")
  };

  if (!supabase) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "signup",
        role: "ambassador",
        error: "supabase-unavailable"
      })
    );
  }

  const parsed = ambassadorSignupSchema.safeParse({
    ...values,
    openToTravel: values.openToTravel === "on",
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirmPassword") || "")
  });

  if (!parsed.success) {
    return {
      error: signupIssueMessage(parsed.error, ambassadorSignupFieldMessages),
      values,
      attempt
    };
  }

  const { error, data } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: buildAuthConfirmUrl("/login?verified=ambassador"),
      data: {
        role: "ambassador",
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
        region_slug: parsed.data.regionSlug,
        experience: parsed.data.experience,
        referred_by: parsed.data.referredBy?.trim() || null,
        open_to_travel: parsed.data.openToTravel ?? false,
        travel_regions: splitCommaList(parsed.data.travelRegions ?? "")
      }
    }
  });

  if (isEmailTaken(error, data?.user ?? null)) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "login",
        error: "email-exists"
      })
    );
  }

  if (error) {
    return {
      error: "We couldn't create that account right now. Please try again.",
      values,
      attempt
    };
  }

  void sendAmbassadorApplicationReceivedEmail({
    ambassadorEmail: parsed.data.email,
    ambassadorName: parsed.data.fullName
  }).catch(() => {});

  if (data.session) {
    await supabase.auth.signOut();
  }

  redirect(
    buildPublicAuthPath(returnTo, {
      auth: "login",
      checkEmail: "ambassador",
      application: "received"
    })
  );
}

export async function loginWithPasswordAction(formData: FormData) {
  const supabase = await createClient();
  const returnTo = returnToPath(formData);

  if (!supabase) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "login",
        error: "supabase-unavailable"
      })
    );
  }

  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || "")
  });

  if (!parsed.success) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "login",
        error: "invalid-credentials"
      })
    );
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "login",
        error: "invalid-credentials"
      })
    );
  }

  redirect(await resolveLoginRedirect());
}

export async function forgotPasswordAction(formData: FormData) {
  const supabase = await createClient();
  const returnTo = returnToPath(formData);

  if (!supabase) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "forgot",
        error: "supabase-unavailable"
      })
    );
  }

  const parsed = forgotPasswordSchema.safeParse({
    email: String(formData.get("email") || "")
  });

  if (!parsed.success) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "forgot",
        error: "invalid-email"
      })
    );
  }

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: buildAuthConfirmUrl("/reset-password")
  });

  if (error) {
    redirect(
      buildPublicAuthPath(returnTo, {
        auth: "forgot",
        error: "reset-failed"
      })
    );
  }

  redirect(
    buildPublicAuthPath(returnTo, {
      auth: "forgot",
      sent: parsed.data.email
    })
  );
}

export async function updatePasswordAction(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect(
      buildPublicAuthPath("/", {
        auth: "login",
        error: "supabase-unavailable"
      })
    );
  }

  const parsed = resetPasswordSchema.safeParse({
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirmPassword") || "")
  });

  if (!parsed.success) {
    redirect("/reset-password?error=password-mismatch");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password
  });

  if (error) {
    redirect("/reset-password?error=reset-failed");
  }

  await supabase.auth.signOut();
  redirect(
    buildPublicAuthPath("/", {
      auth: "login",
      reset: "success"
    })
  );
}

export async function logoutAction() {
  const supabase = await createClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect(
    buildPublicAuthPath("/", {
      auth: "login",
      loggedOut: "1"
    })
  );
}
