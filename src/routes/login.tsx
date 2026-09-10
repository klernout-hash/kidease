import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { authClient, authEnabled, signIn, turnstileFetchOptions } from "@/lib/auth/client";
import { authClientErrorMessage, friendlyAuthError } from "@/lib/auth/login-errors";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import type { GrokProvider } from "@/lib/auth/providers";
import { getSignInProviders } from "@/lib/server/sign-in-providers";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { PasswordField } from "@/components/password-field";
import { Shell } from "@/components/shell";
import { rememberRole } from "@/components/role-boot";
import { setRole } from "@/lib/server/family";
import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import {
  consumeJustSignedOut,
  deskFromPathname,
  deskQueryValue,
  funnelDestPath,
  isAdminLoginIntent,
  loginRoleFromDesk,
  parseDeskQuery,
  postLoginDestKind,
  readStickyDesk,
  resolvePostLoginPath,
  sanitizePostLoginNext,
  staffTwoFactorRequired,
  writeStickyDesk,
} from "@/lib/desks";
import {
  captureLoginFunnel,
  continueAfterSignIn,
  LOGIN_STALL_MS,
  loginErrorCallbackUrl,
  markContinued,
  twoFactorPageUrl,
  waitForSignedInSession,
} from "@/lib/auth/login-funnel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isNative } from "@/lib/native";
import { useCopy } from "@/lib/use-copy";

type Role = "parent" | "provider" | "admin";
type DeskAlias = "parent" | "director" | "centre" | "admin" | "support" | "provider";

export type LoginSearch = { next?: string; role?: Role; intent?: "in" | "up" | "admin"; desk?: DeskAlias };

const OPERATOR_EMAIL = KIDEASE_OPERATOR_EMAIL;

export function loginValidateSearch(s: Record<string, unknown>): LoginSearch {
  const out: LoginSearch = {};
  const next = typeof s.next === "string" ? sanitizePostLoginNext(s.next) : null;
  if (next) out.next = next;
  if (s.role === "parent" || s.role === "provider" || s.role === "admin") out.role = s.role;
  if (s.intent === "in" || s.intent === "up" || s.intent === "admin") out.intent = s.intent;
  const desk = parseDeskQuery(typeof s.desk === "string" ? s.desk : "");
  if (desk) out.desk = deskQueryValue(desk);
  return out;
}

export async function loginLoader() {
  const providers = await withTimeoutFallback(getSignInProviders(), LOADER_SETTLE_MS, []);
  return { providers };
}

export const Route = createFileRoute("/login")({
  validateSearch: loginValidateSearch,
  loader: loginLoader,
  component: Login,
});

function twoFactorUrl(dest: string) {
  return twoFactorPageUrl(dest);
}

export function Login() {
  const { providers } = Route.useLoaderData();
  const search = Route.useSearch();
  return <LoginScreen providers={providers} search={search} />;
}

export function LoginScreen({
  providers,
  search,
}: {
  providers: GrokProvider[];
  search: LoginSearch;
}) {
  const { t } = useCopy();
  const deskHint = parseDeskQuery(search.desk);
  const role = search.role ?? (deskHint ? loginRoleFromDesk(deskHint) : undefined);
  const operator = isAdminLoginIntent({
    role: role ?? search.role,
    desk: search.desk,
    intent: search.intent,
    next: search.next,
  });
  const dest = resolvePostLoginPath({
    next: search.next,
    desk: deskHint,
    role: role ?? null,
    sticky: readStickyDesk(),
  });
  const { user, isPending: sessionPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">(operator ? "in" : search.intent === "up" ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(operator ? OPERATOR_EMAIL : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } = useTurnstileToken();
  const submitLock = useRef(false);
  const continued = useRef(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (role === "parent" || role === "provider") rememberRole(role);
    if (deskHint) writeStickyDesk(deskHint);
  }, [role, deskHint]);

  useEffect(() => {
    captureLoginFunnel({ step: "viewed", native: isNative() });
  }, []);

  useEffect(() => {
    if (!busy) {
      setStalled(false);
      return;
    }
    const id = window.setTimeout(() => setStalled(true), LOGIN_STALL_MS);
    return () => window.clearTimeout(id);
  }, [busy]);

  useEffect(() => {
    if (sessionPending || !user || busy || continued.current) return;
    if (consumeJustSignedOut()) return;
    continued.current = true;
    setBusy(true);
    setError(null);
    void continueAfterSignIn({
      next: search.next,
      desk: deskHint,
      role: role ?? null,
      sticky: readStickyDesk(),
      method: "session",
    }).catch(() => {
      continued.current = false;
      setError("Could not open your desk. Use Retry, or open https://www.kidease.ca/login.");
      setBusy(false);
    });
  }, [sessionPending, user, dest, busy, search.next, deskHint, role]);

  async function finish() {
    const session = await waitForSignedInSession(() => authClient.getSession());
    if (role === "parent" || role === "provider") {
      try {
        await setRole({ data: role });
      } catch {
        /* RoleBoot will retry once the session is visible */
      }
    }
    continued.current = true;
    captureLoginFunnel({
      step: "succeeded",
      method: "email",
      native: isNative(),
      ...(session?.data?.user ? {} : { reason: "session_pending" }),
    });
    await continueAfterSignIn({
      next: search.next,
      desk: deskHint,
      role: role ?? null,
      sticky: readStickyDesk(),
      method: "email",
    });
  }

  function openDesk() {
    continued.current = true;
    setBusy(true);
    setError(null);
    void continueAfterSignIn({
      next: search.next,
      desk: deskHint,
      role: role ?? null,
      sticky: readStickyDesk(),
      method: "session",
    }).catch(() => {
      continued.current = false;
      setError("Could not open your desk. Use Retry, or open https://www.kidease.ca/login.");
      setBusy(false);
    });
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (operator && email.trim().toLowerCase() !== OPERATOR_EMAIL) {
        throw new Error("Operator sign-in is only for the KidEase owner account.");
      }
      const challenge = takeChallenge();
      if (turnstileRequired && !challenge) {
        throw new Error("Please complete the security check, then try again.");
      }
      captureLoginFunnel({ step: "submitted", method: "email", native: isNative() });
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          fetchOptions: turnstileFetchOptions(challenge),
        });
        if (res.error) throw new Error(friendlyAuthError(authClientErrorMessage(res.error)));
        rememberToken(res.data);
      } else {
        const res = await authClient.signIn.email({ email, password, fetchOptions: turnstileFetchOptions(challenge) });
        if (res.error) {
          throw new Error(friendlyAuthError(authClientErrorMessage(res.error)));
        }
        rememberToken(res.data);
      }
      await finish();
    } catch (err) {
      const message = friendlyAuthError(authClientErrorMessage(err)) || "Sign-in failed";
      captureLoginFunnel({ step: "failed", method: "email", reason: funnelFailReason(message), native: isNative() });
      setError(message);
      resetTurnstile();
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  async function onSocial(providerId: string) {
    setBusy(true);
    setError(null);
    if (role === "parent" || role === "provider") rememberRole(role);
    try {
      captureLoginFunnel({ step: "submitted", method: "social", native: isNative() });
      captureLoginFunnel({
        step: "dest_resolved",
        dest_kind: postLoginDestKind(dest),
        dest_path: funnelDestPath(dest),
        desk: deskFromPathname(dest) ?? undefined,
      });
      markContinued(dest, { method: "social" });
      await signIn(providerId, {
        callbackURL: staffTwoFactorRequired(dest) ? twoFactorUrl(dest) : dest,
        errorCallbackURL: loginErrorCallbackUrl({
          next: search.next,
          role,
          desk: search.desk,
          intent: search.intent,
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? friendlyAuthError(err.message) : "Sign-in failed";
      captureLoginFunnel({ step: "failed", method: "social", reason: funnelFailReason(message), native: isNative() });
      setError(message.trim() || "Sign-in failed");
      setBusy(false);
    }
  }

  const title = operator
    ? t("operatorSignIn")
    : role === "provider"
      ? t("providerSignIn")
      : role === "parent"
        ? t("parentSignIn")
        : t("signIn");
  const nextPath = (search.next || "").split("?")[0] || "";
  const lead = operator
    ? t("operatorLead")
    : nextPath.startsWith("/daycare/")
      ? t("loginLeadListing")
      : nextPath === "/search"
        ? t("loginLeadSearchSave")
        : role === "provider"
          ? t("loginLeadProvider")
          : role === "parent"
            ? t("loginLeadParent")
            : t("loginLead");

  return (
    <Shell bare>
      <main
        className="mx-auto grid min-h-[calc(100dvh-4.5rem)] w-full min-w-0 max-w-5xl overflow-x-hidden lg:grid-cols-2"
        data-ke="login-split"
      >
        <div className="relative hidden min-w-0 overflow-hidden lg:block">
          <img
            src="/photos/community.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            fetchPriority="low"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-fg/70 to-fg/10" />
          <p className="absolute bottom-10 left-10 right-10 font-display text-3xl text-primary-fg">{t("tagline")}</p>
        </div>
        <div className="grid min-w-0 place-items-center px-[clamp(0.75rem,3vw,2rem)] py-8 sm:py-10">
          <div className="w-full min-w-0 max-w-md rounded-xl bg-surface p-4 shadow-card ring-1 ring-border sm:p-8">
            <div className="flex justify-center">
              <BrandMark size="md" />
            </div>
            <h1 className="mt-4 font-display text-2xl sm:mt-6 sm:text-3xl">{mode === "up" && role && !operator ? t("createAccount") : title}</h1>
            <p className="mt-2 text-sm text-muted">{user && !sessionPending ? "Opening your desk…" : lead}</p>
            {operator && !user ? (
              <p className="mt-1 text-xs text-subtle" data-ke="admin-titan-note">
                {t("operatorEmailNote")}
              </p>
            ) : null}
          <form onSubmit={onEmail} className="mt-6 space-y-3 ph-no-capture" data-ke={operator ? "admin-email-first" : "email-sign-in"}>
            {mode === "up" && !operator ? (
              <label className="block text-sm">
                {t("name")}
                <input
                  className="ke-input mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              {t("email")}
                <input
                  type="email"
                  required
                  className="ke-input mt-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="email"
                  enterKeyHint="next"
                  readOnly={operator}
                />
            </label>
            <PasswordField
              label={t("password")}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
            />
            <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
            {error ? <p className="text-sm text-danger" data-ke="auth-error">{error}</p> : null}
            {stalled || error ? (
              <div className="flex flex-wrap gap-3 text-sm" data-ke="login-recovery">
                <button
                  type="button"
                  className="min-h-11 font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    continued.current = false;
                    setError(null);
                    setStalled(false);
                    setBusy(false);
                  }}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="min-h-11 font-medium text-muted underline-offset-4 hover:underline"
                  onClick={() => openDesk()}
                >
                  {dest.startsWith("/search") ? "Back to Explore" : dest.startsWith("/daycare/") ? "Back to listing" : "Open your desk"}
                </button>
                <a href="/parent" className="min-h-11 font-medium text-subtle underline-offset-4 hover:underline">
                  Parent desk
                </a>
              </div>
            ) : null}
            {authEnabled && providers.length === 0 && !operator ? (
              <p className="text-xs text-muted">
                Sign-in methods could not load. If this keeps happening, a security filter may be blocking KidEase.
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="w-full min-h-12"
              data-ke="email-primary"
              disabled={busy || (turnstileRequired && !token.trim())}
            >
              {busy ? "Opening your desk…" : mode === "up" && !operator ? t("createAccount") : t("signIn")}
            </Button>
          </form>
          {mode === "in" ? (
            <div className="mt-3">
              <Link
                to="/forgot-password"
                search={{ email: (operator ? OPERATOR_EMAIL : email).trim() }}
                className="text-[13px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                Forgot password?
              </Link>
              <p className="mt-2 text-[13px] text-muted">
                If none of the passwords you remember work, reset from that page. The link is emailed to the
                inbox on the account and expires in about an hour.
              </p>
            </div>
          ) : null}
          {!operator ? (
          <button
            type="button"
            className="mt-4 text-sm text-muted underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "up" ? "in" : "up")}
          >
            {mode === "up" ? t("haveAccount") : t("needAccount")}
          </button>
          ) : null}
          {!operator && (providers.length > 0 || !authEnabled) ? (
          <div className="mt-6">
            <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-wider text-subtle">
              <span className="h-px flex-1 bg-border" />
              {t("orSocial")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2" data-ke="social-sign-in">
              {authEnabled ? (
                providers.map((p: GrokProvider) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant={p.idp === "apple" ? "apple" : "secondary"}
                    size="md"
                    className="w-full font-normal"
                    data-ke="social-secondary"
                    disabled={busy}
                    onClick={() => void onSocial(p.providerId)}
                  >
                    {p.idp === "apple" ? <AppleMark /> : p.idp === "facebook" ? <FacebookMark /> : null}
                    {p.idp === "apple"
                      ? t("continueApple")
                      : p.idp === "google"
                        ? t("continueGoogle")
                        : p.idp === "facebook"
                          ? t("continueFacebook")
                          : p.label}
                  </Button>
                ))
              ) : (
                <p className="text-sm text-muted">Sign-in is disabled.</p>
              )}
            </div>
          </div>
          ) : null}
          <p className="mt-6 text-center text-xs text-subtle">
            <a
              href={search.next && search.next.startsWith("/") ? search.next : "/"}
              className="underline-offset-4 hover:underline"
            >
              {t("back")}
            </a>
            {" · "}
            <Link to="/privacy" className="underline-offset-4 hover:underline">
              {t("privacy")}
            </Link>
            {" · "}
            <Link to="/terms" className="underline-offset-4 hover:underline">
              {t("terms")}
            </Link>
            {" · "}
            <Link to="/cookies" className="underline-offset-4 hover:underline">
              {t("cookies")}
            </Link>
          </p>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function funnelFailReason(message: string): string {
  const raw = message.toLowerCase();
  if (raw.includes("security filter")) return "cloudflare";
  if (raw.includes("security check")) return "turnstile";
  if (raw.includes("too many")) return "rate_limit";
  if (raw.includes("session")) return "session";
  if (raw.includes("incorrect") || raw.includes("password")) return "credentials";
  if (raw.includes("pop-up")) return "popup";
  return "other";
}

function rememberToken(data: { token?: string | null } | null | undefined) {
  const token = data?.token;
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M16.365 12.74c-.024 2.607 2.258 3.476 2.284 3.488-.019.06-.357 1.23-1.177 2.437-.71 1.044-1.447 2.083-2.607 2.106-1.14.024-1.505-.681-2.81-.681-1.303 0-1.712.657-2.79.705-1.12.048-1.973-1.13-2.69-2.17-1.463-2.124-2.582-6.004-1.08-8.625.746-1.305 2.078-2.132 3.524-2.156 1.1-.024 2.138.747 2.81.747.67 0 1.926-.923 3.247-.787.553.023 2.107.224 3.106 1.686-.08.05-1.855 1.09-1.817 3.25m-1.686-5.01c.595-.722 1.002-1.725.891-2.73-.862.035-1.905.576-2.52 1.298-.553.64-1.037 1.663-.906 2.64.958.074 1.94-.487 2.535-1.208" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.2h2.42l.36-2.8H13.5V9.22c0-.81.22-1.36 1.39-1.36H16.4V5.36A18.7 18.7 0 0 0 13.96 5C11.54 5 9.9 6.48 9.9 9v2h-2.3v2.8H9.9V21h3.6Z" />
    </svg>
  );
}
