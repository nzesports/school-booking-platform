"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { usePathname } from "next/navigation";

import { AuthModalHost } from "@/components/auth/auth-modal-host";
import type { Region } from "@/lib/domain/types";
import { PUBLIC_AUTH_QUERY_KEYS } from "@/lib/services/auth-public";

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

const AUTH_URL_CHANGE_EVENT = "nz-esports-auth-url-change";
const AUTH_URL_HISTORY_PATCH_FLAG = "__nzEsportsAuthHistoryPatched";

function ensureAuthHistoryPatched() {
  if (typeof window === "undefined") {
    return;
  }

  const globalWindow = window as typeof window & {
    [AUTH_URL_HISTORY_PATCH_FLAG]?: boolean;
  };

  if (globalWindow[AUTH_URL_HISTORY_PATCH_FLAG]) {
    return;
  }

  const wrapHistoryMethod = (method: "pushState" | "replaceState") => {
    const original = window.history[method];

    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(AUTH_URL_CHANGE_EVENT));
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  globalWindow[AUTH_URL_HISTORY_PATCH_FLAG] = true;
}

function subscribeToAuthUrlChange(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  ensureAuthHistoryPatched();

  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(AUTH_URL_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(AUTH_URL_CHANGE_EVENT, onStoreChange);
  };
}

function getAuthUrlSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.search.replace(/^\?/, "");
}

export function AuthModalProvider({
  children,
  regions,
  loginAction,
  registerSchoolAction,
  registerAmbassadorAction,
  forgotPasswordAction,
  authEnabled
}: {
  children: ReactNode;
  regions: Region[];
  loginAction: AuthAction;
  registerSchoolAction: AuthAction;
  registerAmbassadorAction: AuthAction;
  forgotPasswordAction: AuthAction;
  authEnabled: boolean;
}) {
  const pathname = usePathname();
  const paramsString = useSyncExternalStore(
    subscribeToAuthUrlChange,
    getAuthUrlSnapshot,
    () => ""
  );

  const searchParams = useMemo(() => new URLSearchParams(paramsString), [paramsString]);

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
      const params = new URLSearchParams(window.location.search.replace(/^\?/, ""));

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

      window.history.replaceState(window.history.state, "", nextUrl);
    },
    [pathname]
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
