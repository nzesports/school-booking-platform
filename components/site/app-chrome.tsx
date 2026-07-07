"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { SignupFormState } from "@/app/auth/actions";
import { AuthModalProvider } from "@/components/auth/auth-modal-provider";
import { BookingModalProvider } from "@/components/site/booking-modal-provider";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import type { PresentationType, Region } from "@/lib/domain/types";
import type { AvailabilityConfig } from "@/lib/services/availability";
import { cn } from "@/lib/utils";

const portalPrefixes = ["/school", "/ambassador", "/staff", "/admin"];
const authPrefixes = ["/signup", "/login", "/forgot-password", "/reset-password"];

export function AppChrome({
  children,
  presentations,
  regions,
  availabilityConfig,
  bookingAction,
  subscribeAction,
  loginAction,
  registerSchoolAction,
  registerAmbassadorAction,
  forgotPasswordAction,
  authEnabled
}: {
  children: ReactNode;
  presentations: PresentationType[];
  regions: Region[];
  availabilityConfig?: AvailabilityConfig;
  bookingAction: (formData: FormData) => void | Promise<void>;
  subscribeAction: (formData: FormData) => void | Promise<void>;
  loginAction: (formData: FormData) => void | Promise<void>;
  registerSchoolAction: (state: SignupFormState, formData: FormData) => Promise<SignupFormState>;
  registerAmbassadorAction: (
    state: SignupFormState,
    formData: FormData
  ) => Promise<SignupFormState>;
  forgotPasswordAction: (formData: FormData) => void | Promise<void>;
  authEnabled: boolean;
}) {
  const pathname = usePathname();
  const isPortalRoute = portalPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isAuthRoute = authPrefixes.some((prefix) => pathname.startsWith(prefix));
  const footerReturnTo = `${pathname || "/"}#contact`;

  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-col overflow-x-clip",
        isPortalRoute ? "portal-surface" : "marketing-surface"
      )}
    >
      {isPortalRoute ? (
        // Portals skip the marketing chrome but keep the booking modal, so
        // in-portal "Book a presentation" buttons open it without leaving.
        <BookingModalProvider
          presentations={presentations}
          regions={regions}
          availabilityConfig={availabilityConfig}
          action={bookingAction}
        >
          <div className="relative z-10 flex-1">{children}</div>
        </BookingModalProvider>
      ) : (
        <AuthModalProvider
          regions={regions}
          loginAction={loginAction}
          registerSchoolAction={registerSchoolAction}
          registerAmbassadorAction={registerAmbassadorAction}
          forgotPasswordAction={forgotPasswordAction}
          authEnabled={authEnabled}
        >
          <BookingModalProvider
            presentations={presentations}
            regions={regions}
            availabilityConfig={availabilityConfig}
            action={bookingAction}
          >
            <SiteHeader />
            <div className="relative z-10">{children}</div>
            <SiteFooter
              compact={isAuthRoute}
              subscribeAction={subscribeAction}
              returnTo={footerReturnTo}
            />
          </BookingModalProvider>
        </AuthModalProvider>
      )}
    </div>
  );
}
