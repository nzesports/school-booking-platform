"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { SignupFormState } from "@/app/auth/actions";
import { AuthModalHost } from "@/components/auth/auth-modal-host";
import type { Region } from "@/lib/domain/types";
import { PUBLIC_AUTH_QUERY_KEYS } from "@/lib/services/auth-public";
import { clearGuestBookingDefaults } from "@/lib/services/guest-booking-defaults";

export type AuthModalMode = "login" | "signup" | "forgot";
export type AuthModalRole = "school" | "ambassador";

type AuthModalContextValue = {
  closeAuth: () => void;
  currentMode: AuthModalMode | null;
  currentRole: AuthModalRole;
  openAuth: (options: { mode: AuthModalMode; role?: AuthModalRole }) => void;
  returnTo: string;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

type AuthAction = (formData: FormData) => void | Promise<void>;
type SignupAction = (state: SignupFormState, formData: FormData) => Promise<SignupFormState>;

type AuthModalProviderProps = {
  children: ReactNode;
  regions: Region[];
  loginAction: AuthAction;
  registerSchoolAction: SignupAction;
  registerAmbassadorAction: SignupAction;
  forgotPasswordAction: AuthAction;
  authEnabled: boolean;
};

export function AuthModalProvider(props: AuthModalProviderProps) {
  return (
    <Suspense fallback={<AuthModalProviderContent {...props} paramsString="" />}>
      <AuthModalProviderFromUrl {...props} />
    </Suspense>
  );
}

function AuthModalProviderFromUrl(props: AuthModalProviderProps) {
  const searchParams = useSearchParams();

  return <AuthModalProviderContent {...props} paramsString={searchParams.toString()} />;
}

function AuthModalProviderContent({
  children,
  regions,
  loginAction,
  registerSchoolAction,
  registerAmbassadorAction,
  forgotPasswordAction,
  authEnabled,
  paramsString
}: AuthModalProviderProps & { paramsString: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const searchParams = useMemo(() => new URLSearchParams(paramsString), [paramsString]);

  useEffect(() => {
    if (pathname.startsWith("/school") || searchParams.get("checkEmail") === "school") {
      clearGuestBookingDefaults();
    }
  }, [pathname, searchParams]);

  const currentMode = (() => {
    const value = searchParams.get("auth");

    if (value === "login" || value === "signup" || value === "forgot") {
      return value as AuthModalMode;
    }

    return null;
  })();

  const currentRole =
    searchParams.get("role") === "ambassador" ? ("ambassador" as const) : ("school" as const);

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(paramsString);

    for (const key of PUBLIC_AUTH_QUERY_KEYS) {
      params.delete(key);
    }

    const nextQuery = params.toString();
    return nextQuery ? `${pathname}?${nextQuery}` : pathname;
  }, [paramsString, pathname]);

  const mutateAuthUrl = useCallback(
    ({
      mode,
      role
    }: {
      mode?: AuthModalMode;
      role?: AuthModalRole;
    }) => {
      const params = new URLSearchParams(paramsString);

      for (const key of PUBLIC_AUTH_QUERY_KEYS) {
        params.delete(key);
      }

      if (mode) {
        params.set("auth", mode);
      }

      if (role && mode === "signup") {
        params.set("role", role);
      }

      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

      router.replace(nextUrl, { scroll: false });
    },
    [paramsString, pathname, router]
  );

  const openAuth = useCallback(
    (options: { mode: AuthModalMode; role?: AuthModalRole }) => {
      mutateAuthUrl(options);
    },
    [mutateAuthUrl]
  );

  const closeAuth = useCallback(() => {
    mutateAuthUrl({});
  }, [mutateAuthUrl]);

  const value = useMemo(
    () => ({
      closeAuth,
      currentMode,
      currentRole,
      openAuth,
      returnTo
    }),
    [closeAuth, currentMode, currentRole, openAuth, returnTo]
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModalHost
        mode={currentMode}
        role={currentRole}
        query={{
          application: searchParams.get("application"),
          checkEmail: searchParams.get("checkEmail"),
          error: searchParams.get("error"),
          loggedOut: searchParams.get("loggedOut"),
          reset: searchParams.get("reset"),
          sent: searchParams.get("sent"),
          verified: searchParams.get("verified")
        }}
        regions={regions}
        loginAction={loginAction}
        registerSchoolAction={registerSchoolAction}
        registerAmbassadorAction={registerAmbassadorAction}
        forgotPasswordAction={forgotPasswordAction}
        authEnabled={authEnabled}
        returnTo={returnTo}
        closeAuth={closeAuth}
        openAuth={openAuth}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const value = useContext(AuthModalContext);

  if (!value) {
    throw new Error("useAuthModal must be used within an AuthModalProvider.");
  }

  return value;
}
