import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { authBackFallback, currentAuthBackFallback } from "@/lib/auth/auth-back";
import { useCallback, useEffect, useRef, useState, type FormEvent, type MutableRefObject } from "react";
import { authClient, authEnabled, clearLocalSignedOut, dropExistingSession, signIn, turnstileFetchOptions } from "@/lib/auth/client";
import { authClientErrorMessage, friendlyAuthError } from "@/lib/auth/login-errors";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { reviewerSignInSkipsTurnstile } from "@/lib/reviewer-accounts";
import { nativeSocialPlatform, sanitizeNativeOAuthError, signInProvidersForDevice } from "@/lib/auth/native-oauth";
import { type GrokProvider } from "@/lib/auth/providers";
import { getSignInProviders } from "@/lib/server/sign-in-providers";
import { readClientPlayServices } from "@/lib/native-entitlements";
import { useStoreChannel } from "@/lib/use-native-shell";
import { isFrPath } from "@/lib/locale-path";
import { LOADER_SETTLE_MS, withTimeout, withTimeoutFallback } from "@/lib/timeout";
import { Button } from "@/components/ui/button";
import { SocialSignInButtons } from "@/components/social-sign-in-buttons";
import { ContinueAgeNotice } from "@/components/continue-age-notice";
import { BrandMark } from "@/components/brand-mark";
import { PasswordField } from "@/components/password-field";
import { PasswordRules } from "@/components/password-rules";
import { localPasswordIssue } from "@/lib/password-hygiene";
import { Shell } from "@/components/shell";
import { headChromeLocale } from "@/lib/head-locale";
import { MARKETING_PAGE_SEO, MARKETING_PAGE_SEO_FR, pageSeoHead, withNoindex } from "@/lib/page-seo";
import { rememberRole } from "@/components/role-boot";
import { setRole } from "@/lib/server/family";
import { confirmAdultAge } from "@/lib/server/adult-confirm";
import { markAdultConfirmedForSession } from "@/lib/adult-confirm";
import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import {
  consumeJustSignedOut,
  deskFromPathname,
  deskQueryValue,
  funnelDestPath,
  isAdminLoginIntent,
  isCloudflareAccessPath,
  loginRoleFromDesk,
  parseDeskQuery,
  postLoginDestKind,
  readRememberedRole,
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
import { canContinueAdminSession } from "@/lib/server/reauth";
import { isNative } from "@/lib/native";
import { nativeAccountDest } from "@/lib/native-admin";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { useCopy } from "@/lib/use-copy";
import { confirmAction } from "@/lib/success-confirm";
import {
  ADMIN_IDLE_CHECK_MS,
  adminAutoContinueDecision,
  LOGIN_CONTINUE_MS,
  LOGIN_POST_MS,
  LOGIN_BOUNCE_KEY,
  PASSWORD_CONTINUE_MESSAGE,
  loginBounceBlocks,
  loginBounceRecord,
  releaseStuckLogin,
} from "@/lib/auth/login-stall";
import {
  FACEBOOK_ROLE_PENDING_KEY,
  facebookNewUserCallbackPath,
  facebookSignupRole,
  socialSignupCallbackPath,
} from "@/lib/auth/social-callback";
import { capturePostHogEvent } from "@/lib/posthog";
import { trackProductEvent } from "@/lib/track-product-event";
import { isSignupWhy, SIGNUP_FUNNEL_EVENT, signupFunnelPayload, type SignupWhy } from "@/lib/signup-funnel";
import { parentMobileIssue, smsOptInWasBlocked, stashParentSmsOptIn, takeParentSmsOptIn } from "@/lib/parent-sms-consent";
import { toast } from "sonner";
import { saveParentSmsOptIn } from "@/lib/server/parent-sms-consent";
import { ParentSmsFields } from "@/components/parent-sms-fields";
import { PasskeyOffer } from "@/components/passkey-offer";
import {
  PasskeyRequestError,
  cancelPasskeyCeremony,
  markPasskeyOfferSeen,
  nativeIosSkipsPasskey,
  passkeyRegistrationError,
  passkeyRegistrationReady,
  passkeyWasCancelled,
  prefetchPasskeyRegistration,
  registerPasskey,
  shouldOfferPasskey,
  shouldUseAndroidCredentialManager,
  signInWithPasskey,
} from "@/lib/passkey-client";
import type { CopyKey } from "@/lib/copy";

type Role = "parent" | "provider" | "admin";
type DeskAlias = "parent" | "director" | "centre" | "admin" | "support" | "provider";

export type LoginSearch = {
  next?: string;
  role?: Role;
  intent?: "in" | "up" | "admin";
  step?: "role";
  desk?: DeskAlias;
  why?: SignupWhy;
  lang?: "en" | "fr";
  error?: string;
};

const WHY_LEAD: Record<SignupWhy, CopyKey> = {
  save: "signupWhySave",
  waitlist: "signupWhyWaitlist",
  alerts: "signupWhyAlerts",
  message: "signupWhyMessage",
};

const OPERATOR_EMAIL = KIDEASE_OPERATOR_EMAIL;

/**
 * Email and password live here so a keystroke does not re-render the rest of
 * the sign-in page (social buttons, shell, session). That keeps typing fast.
 */
function LoginEmailControl({
  mode,
  emailRef,
  onOperator,
  onBlurEmail,
  onReviewer,
}: {
  mode: "in" | "up";
  emailRef: MutableRefObject<string>;
  onOperator: (operator: boolean) => void;
  onBlurEmail: (email: string) => void;
  onReviewer: (reviewer: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const operator = useRef(false);
  const reviewer = useRef(false);
  return (
    <input
      type="email"
      required
      className="ke-input mt-1"
      value={email}
      onChange={(e) => {
        const email = e.target.value;
        emailRef.current = email;
        setEmail(email);
        const next = email.trim().toLowerCase() === OPERATOR_EMAIL;
        if (next !== operator.current) {
          operator.current = next;
          onOperator(next);
        }
        const nextReviewer = reviewerSignInSkipsTurnstile(email);
        if (nextReviewer !== reviewer.current) {
          reviewer.current = nextReviewer;
          onReviewer(nextReviewer);
        }
      }}
      onBlur={() => onBlurEmail(emailRef.current.trim())}
      autoComplete={mode === "in" ? "username webauthn" : "email"}
      autoCapitalize="none"
      autoCorrect="off"
      inputMode="email"
      enterKeyHint="next"
    />
  );
}

function LoginPasswordControl({
  mode,
  showRules,
  label,
  passwordRef,
}: {
  mode: "in" | "up";
  showRules: boolean;
  label: string;
  passwordRef: MutableRefObject<string>;
}) {
  const [password, setPassword] = useState("");
  return (
    <>
      <PasswordField
        label={label}
        required
        minLength={8}
        value={password}
        onChange={(e) => {
          passwordRef.current = e.target.value;
          setPassword(e.target.value);
        }}
        autoComplete={mode === "up" ? "new-password" : "current-password"}
      />
      {showRules ? <PasswordRules password={password} /> : null}
    </>
  );
}

function LoginNameControl({ nameRef }: { nameRef: MutableRefObject<string> }) {
  const [name, setName] = useState("");
  return (
    <input
      className="ke-input mt-1"
      value={name}
      onChange={(e) => {
        nameRef.current = e.target.value;
        setName(e.target.value);
      }}
      autoComplete="name"
    />
  );
}

export function loginValidateSearch(s: Record<string, unknown>): LoginSearch {
  const out: LoginSearch = {};
  const next = typeof s.next === "string" ? sanitizePostLoginNext(s.next) : null;
  if (next) out.next = next;
  if (s.role === "parent" || s.role === "provider" || s.role === "admin") out.role = s.role;
  if (s.intent === "in" || s.intent === "up" || s.intent === "admin") out.intent = s.intent;
  if (s.step === "role") out.step = "role";
  if (isSignupWhy(s.why)) out.why = s.why;
  if (s.lang === "en" || s.lang === "fr") out.lang = s.lang;
  const oauthError = sanitizeNativeOAuthError(typeof s.error === "string" ? s.error : "");
  if (oauthError) out.error = oauthError;
  const desk = parseDeskQuery(typeof s.desk === "string" ? s.desk : "");
  if (desk) out.desk = deskQueryValue(desk);
  return out;
}

export async function loginLoader() {
  const loaded = await withTimeoutFallback(
    getSignInProviders().then((providers) => ({ providers, providersReady: true })),
    LOADER_SETTLE_MS,
    { providers: [] as GrokProvider[], providersReady: false },
  );
  return loaded;
}

export const Route = createFileRoute("/login")({
  validateSearch: loginValidateSearch,
  loader: loginLoader,
  head: ({ matches }) =>
    withNoindex(
      headChromeLocale(matches) === "fr"
        ? pageSeoHead({ ...MARKETING_PAGE_SEO_FR.login, path: "/login", locale: "fr" })
        : pageSeoHead(MARKETING_PAGE_SEO.login),
    ),
  component: Login,
});

function twoFactorUrl(dest: string) {
  return twoFactorPageUrl(dest);
}

export function Login() {
  const { providers, providersReady } = Route.useLoaderData();
  const search = Route.useSearch();
  return <LoginScreen providers={providers} providersReady={providersReady} search={search} />;
}

export function LoginScreen({
  providers,
  providersReady = true,
  search,
}: {
  providers: GrokProvider[];
  providersReady?: boolean;
  search: LoginSearch;
}) {
  const { t, locale } = useCopy();
  const oauthErrorText = useCallback((code: string | null | undefined): string | null => {
    const clean = sanitizeNativeOAuthError(code);
    if (!clean) return null;
    if (clean === "access_denied") return t("oauthSignInCancelled");
    return t("oauthSignInFailed").replace("{reason}", clean);
  }, [t]);
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const loginPath = isFrPath(pathname) ? "/fr/login" : "/login";
  const storeChannel = useStoreChannel();
  const hideAdmin = useNativeHidesAdmin();
  const shownProviders = signInProvidersForDevice(providers, {
    channel: storeChannel,
    playServices: readClientPlayServices(),
    native: hideAdmin,
    platform: nativeSocialPlatform({ native: hideAdmin, channel: storeChannel }),
  });
  const deskHint = parseDeskQuery(search.desk);
  const role = search.role ?? (deskHint ? loginRoleFromDesk(deskHint) : undefined);
  // URL role=admin / next=/admin must not paint an operator page. Kyle types his email.
  // The native app has no Admin desk, so that URL is a normal sign-in.
  const urlOperator =
    !hideAdmin &&
    isAdminLoginIntent({
      role: role ?? search.role,
      desk: search.desk,
      intent: search.intent,
      next: search.next,
    });
  const dest = nativeAccountDest({
    hideAdmin,
    dest: resolvePostLoginPath({
      next: search.next,
      desk: deskHint,
      role: role ?? null,
      sticky: readStickyDesk(),
    }),
    role: role ?? null,
    desk: search.desk,
    remembered: readRememberedRole(),
  });
  const { user, isPending: sessionPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">(search.intent === "up" ? "up" : "in");
  const nameRef = useRef("");
  const emailRef = useRef("");
  const passwordRef = useRef("");
  const [operator, setOperator] = useState(false);
  const [reviewerSignIn, setReviewerSignIn] = useState(false);
  const [emailLink, setEmailLink] = useState("");
  const parentSignup = mode === "up" && !operator && role !== "provider";
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [error, setError] = useState<string | null>(() => oauthErrorText(search.error));
  const [busy, setBusy] = useState(false);
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } = useTurnstileToken();
  const submitLock = useRef(false);
  const continued = useRef(false);
  const attempt = useRef(0);
  const [stalled, setStalled] = useState(false);
  const [passkeyOffer, setPasskeyOffer] = useState(false);

  useEffect(() => {
    if (role === "parent" || role === "provider") rememberRole(role);
    if (deskHint) writeStickyDesk(deskHint);
  }, [role, deskHint]);

  useEffect(() => {
    captureLoginFunnel({ step: "viewed", native: isNative() });
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => {
      attempt.current += 1;
      const released = releaseStuckLogin("stall");
      continued.current = released.keepContinued;
      submitLock.current = false;
      setBusy(released.busy);
      setStalled(true);
      setError(oauthErrorText(search.error) || released.error);
    }, LOGIN_STALL_MS);
    return () => window.clearTimeout(id);
  }, [busy, oauthErrorText, search.error]);

  async function holdForAdminPassword(id: number): Promise<boolean> {
    const decision = adminAutoContinueDecision({
      adminIntent: urlOperator,
      sessionEmail: user?.primaryEmail,
      ownerEmail: OPERATOR_EMAIL,
    });
    if (decision === "allow") return false;
    if (decision === "check-idle") {
      const idle = await withTimeoutFallback(canContinueAdminSession(), ADMIN_IDLE_CHECK_MS, { ok: false });
      if (attempt.current !== id) return true;
      if (idle.ok) return false;
    }
    const released = releaseStuckLogin("admin-password");
    continued.current = released.keepContinued;
    setBusy(released.busy);
    const sessionEmail = String(user?.primaryEmail || "").trim().toLowerCase();
    const owner = String(OPERATOR_EMAIL || "").trim().toLowerCase();
    const showAdminCopy = urlOperator && sessionEmail.length > 0 && sessionEmail === owner;
    setError(showAdminCopy ? released.error : PASSWORD_CONTINUE_MESSAGE);
    return true;
  }

  useEffect(() => {
    if (sessionPending || !user || busy || continued.current) return;
    if (sanitizeNativeOAuthError(search.error)) return;
    if (search.step === "role" && !facebookSignupRole(role)) return;
    if (consumeJustSignedOut()) return;
    const next = search.next || "";
    let bounceRaw: string | null = null;
    try {
      bounceRaw = sessionStorage.getItem(LOGIN_BOUNCE_KEY);
    } catch {
      bounceRaw = null;
    }
    // /account save used to look signed out, bounce here, and this effect
    // assigned /account again. Each full load reset the stall timer, so the
    // form stayed on “Opening your desk…”.
    if (loginBounceBlocks(bounceRaw, next)) {
      continued.current = true;
      const released = releaseStuckLogin("stall");
      setBusy(released.busy);
      setStalled(true);
      setError(released.error);
      return;
    }
    try {
      sessionStorage.setItem(LOGIN_BOUNCE_KEY, loginBounceRecord(next));
    } catch {
      /* private mode */
    }
    const id = ++attempt.current;
    continued.current = true;
    setBusy(true);
    setStalled(false);
    setError(null);
    void (async () => {
      // Admin URL (including idle-timeout "Sign in again") never auto-continues.
      // The owner mailbox re-checks the idle cookie before any continue.
      // keepContinued stays true on failure so this effect cannot re-arm.
      if (await holdForAdminPassword(id)) return;
      if (attempt.current !== id) return;
      if ((search.intent === "up" || mode === "up") && role !== "provider") {
        const stashed = takeParentSmsOptIn();
        if (stashed) {
          const savedSms = await withTimeoutFallback(saveParentSmsOptIn({ data: stashed }), LOGIN_CONTINUE_MS, undefined);
          if (smsOptInWasBlocked(savedSms)) toast.message(t("smsUnreachable"));
        }
      }
      if (search.intent === "up" && (role === "parent" || role === "provider")) {
        await withTimeoutFallback(setRole({ data: role }), LOGIN_CONTINUE_MS, undefined);
      }
      if (attempt.current !== id) return;
      await withTimeout(
        continueAfterSignIn({
          next: search.next,
          desk: deskHint,
          role: role ?? null,
          sticky: readStickyDesk(),
          method: "session",
        }),
        LOGIN_CONTINUE_MS,
        "continue-timeout",
      );
    })().catch(() => {
      if (attempt.current !== id) return;
      const released = releaseStuckLogin("open-failed");
      continued.current = released.keepContinued;
      setError(released.error);
      setBusy(released.busy);
    });
  }, [sessionPending, user, dest, busy, search.next, search.intent, search.step, search.error, deskHint, role, urlOperator, mode]);

  function passkeyMessage(err: unknown): string {
    if (err instanceof PasskeyRequestError && (err.code === "PASSKEY_RATE_LIMIT" || err.status === 429)) {
      return t("passkeyRateLimited");
    }
    if (err instanceof PasskeyRequestError && err.code === "PASSKEY_UNSUPPORTED") return t("passkeyUnsupported");
    return t("passkeyFailed");
  }

  async function finish(method: "email" | "session" = "email") {
    const session = await waitForSignedInSession(() => authClient.getSession());
    if (session?.data?.user) clearLocalSignedOut();
    if (mode === "up" && (role === "parent" || role === "provider")) {
      await withTimeoutFallback(setRole({ data: role }), LOGIN_CONTINUE_MS, undefined);
    }
    continued.current = true;
    captureLoginFunnel({
      step: "succeeded",
      method,
      native: isNative(),
      ...(session?.data?.user ? {} : { reason: "session_pending" }),
    });
    if (method === "email") {
      const offer = await shouldOfferPasskey();
      if (attempt.current && offer) {
        prefetchPasskeyRegistration();
        setPasskeyOffer(true);
        setBusy(false);
        return;
      }
    }
    await continueAfterSignIn({
      next: search.next,
      desk: deskHint,
      role: role ?? null,
      sticky: readStickyDesk(),
      method,
    });
  }

  async function onPasskey() {
    if (submitLock.current) return;
    submitLock.current = true;
    const id = ++attempt.current;
    setBusy(true);
    setStalled(false);
    setError(null);
    try {
      await cancelPasskeyCeremony();
      await signInWithPasskey();
      if (attempt.current !== id) return;
      await finish("session");
    } catch (err) {
      if (attempt.current !== id || passkeyWasCancelled(err)) return;
      setError(passkeyMessage(err));
    } finally {
      if (attempt.current === id) {
        submitLock.current = false;
        setBusy(false);
      }
    }
  }

  async function onEnablePasskey() {
    setBusy(true);
    setError(null);
    try {
      if (!passkeyRegistrationReady() && !shouldUseAndroidCredentialManager()) {
        prefetchPasskeyRegistration();
        setError(t("passkeyNotReady"));
        return;
      }
      await registerPasskey();
      markPasskeyOfferSeen();
      await finish("session");
    } catch (err) {
      prefetchPasskeyRegistration();
      setError(passkeyRegistrationError(err) || t("passkeyFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onLaterPasskey() {
    markPasskeyOfferSeen();
    setPasskeyOffer(false);
    setBusy(true);
    try {
      await finish("email");
    } catch {
      setBusy(false);
    }
  }

  function openDesk() {
    const id = ++attempt.current;
    continued.current = true;
    setBusy(true);
    setStalled(false);
    setError(null);
    void (async () => {
      if (await holdForAdminPassword(id)) return;
      if (attempt.current !== id) return;
      await withTimeout(
        continueAfterSignIn({
          next: search.next,
          desk: deskHint,
          role: role ?? null,
          sticky: readStickyDesk(),
          method: "session",
        }),
        LOGIN_CONTINUE_MS,
        "continue-timeout",
      );
    })().catch(() => {
      if (attempt.current !== id) return;
      const released = releaseStuckLogin("open-failed");
      continued.current = released.keepContinued;
      setError(released.error);
      setBusy(released.busy);
    });
  }

  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (mode !== "in" || passkeyOffer || nativeIosSkipsPasskey()) return;
    let stopped = false;
    void (async () => {
      try {
        await signInWithPasskey({ autofill: true });
        if (stopped) return;
        await finishRef.current("session");
      } catch (err) {
        if (stopped || passkeyWasCancelled(err)) return;
        if (err instanceof PasskeyRequestError && (err.code === "PASSKEY_AUTOFILL_SKIP" || err.code === "PASSKEY_UNSUPPORTED")) return;
      }
    })();
    return () => {
      stopped = true;
      void cancelPasskeyCeremony();
    };
  }, [mode, passkeyOffer]);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    void cancelPasskeyCeremony();
    if (submitLock.current) return;
    submitLock.current = true;
    const id = ++attempt.current;
    setBusy(true);
    setStalled(false);
    setError(null);
    const email = emailRef.current.trim();
    const password = passwordRef.current;
    const name = nameRef.current.trim();
    const signingOperator = email.toLowerCase() === OPERATOR_EMAIL;
    try {
      if (operator && !signingOperator) {
        throw new Error("Operator sign-in is only for the KidEase owner account.");
      }
      const challenge = takeChallenge();
      const reviewerBypass = mode === "in" && reviewerSignInSkipsTurnstile(email);
      if (turnstileRequired && !challenge && !reviewerBypass) {
        throw new Error("Please complete the security check, then try again.");
      }
      captureLoginFunnel({ step: "submitted", method: "email", native: isNative() });
      if (search.why && mode === "up") {
        capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload("email_continue", { source: "login" }));
      }
      // Operator / Admin idle recovery must mint a new session.createdAt so
      // assertAdminIdleFresh can bootstrap the idle cookie after password entry.
      if (user || operator || urlOperator) {
        await dropExistingSession();
      }
      if (mode === "up") {
        trackProductEvent("signup_started", { method: "email", source: "login", role });
        const hygiene = localPasswordIssue(password, email);
        if (hygiene) throw new Error(hygiene);
        if (parentSignup) {
          const phoneIssue = parentMobileIssue(phone);
          if (phoneIssue) throw new Error(phoneIssue);
        }
        const res = await withTimeout(
          authClient.signUp.email({
            email,
            password,
            name: name || email.split("@")[0] || email,
            fetchOptions: turnstileFetchOptions(challenge),
          }),
          LOGIN_POST_MS,
          "sign-in-timeout",
        );
        if (res.error) throw new Error(friendlyAuthError(authClientErrorMessage(res.error)));
        rememberToken(res.data);
        if (parentSignup) {
          const savedSms = await withTimeoutFallback(
            saveParentSmsOptIn({ data: { phone, smsConsent, locale } }),
            LOGIN_CONTINUE_MS,
            undefined,
          );
          if (smsOptInWasBlocked(savedSms)) toast.message(t("smsUnreachable"));
        }
        if (!signingOperator) {
          await withTimeoutFallback(confirmAdultAge(), LOGIN_CONTINUE_MS, undefined);
        }
        trackProductEvent("signup_completed", { method: "email", source: "login", role });
        confirmAction(t, "accountCreated");
      } else {
        const res = await withTimeout(
          authClient.signIn.email({ email, password, fetchOptions: turnstileFetchOptions(challenge) }),
          LOGIN_POST_MS,
          "sign-in-timeout",
        );
        if (res.error) {
          throw new Error(friendlyAuthError(authClientErrorMessage(res.error)));
        }
        rememberToken(res.data);
      }
      await finish();
    } catch (err) {
      if (attempt.current !== id) return;
      const message = friendlyAuthError(authClientErrorMessage(err)) || "Sign-in failed";
      captureLoginFunnel({ step: "failed", method: "email", reason: funnelFailReason(message), native: isNative() });
      setError(message);
      resetTurnstile();
    } finally {
      if (attempt.current === id) {
        submitLock.current = false;
        setBusy(false);
      }
    }
  }

  async function onSocial(providerId: string) {
    setBusy(true);
    setStalled(false);
    setError(null);
    if (!operator) markAdultConfirmedForSession();
    if (role === "parent" || role === "provider") rememberRole(role);
    if (parentSignup) stashParentSmsOptIn(phone, smsConsent);
    try {
      captureLoginFunnel({ step: "submitted", method: "social", native: isNative() });
      if (search.why && providerId.includes("google")) {
        capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload("google_continue", { source: "login" }));
      }
      captureLoginFunnel({
        step: "dest_resolved",
        dest_kind: postLoginDestKind(dest),
        dest_path: funnelDestPath(dest),
        desk: deskFromPathname(dest) ?? undefined,
      });
      markContinued(dest, { method: "social" });
      const socialDest =
        !operator && isCloudflareAccessPath(dest) ? (role === "provider" ? "/provider" : "/parent") : dest;
      const staged = socialSignupCallbackPath({
        intent: search.intent,
        role,
        desk: search.desk,
        next: search.next,
        loginPath,
      });
      await withTimeout(signIn(providerId, {
        callbackURL:
          staged ??
          (staffTwoFactorRequired(socialDest)
            ? twoFactorUrl(socialDest)
            : loginErrorCallbackUrl({
                next: search.next,
                role,
                desk: search.desk,
                intent: search.intent === "up" || search.intent === "admin" ? search.intent : "in",
                loginPath,
              })),
        errorCallbackURL: loginErrorCallbackUrl({
          next: search.next,
          role,
          desk: search.desk,
          intent: search.intent,
          loginPath,
        }),
        ...(providerId === "facebook"
          ? {
              newUserCallbackURL: facebookNewUserCallbackPath({
                role: facebookSignupRole(role),
                desk: search.desk,
                next: search.next,
                locale: loginPath === "/fr/login" ? "fr" : locale,
              }),
            }
          : {}),
      }), LOGIN_POST_MS, "sign-in-timeout");
    } catch (err) {
      const message = err instanceof Error ? friendlyAuthError(err.message) : "Sign-in failed";
      captureLoginFunnel({ step: "failed", method: "social", reason: funnelFailReason(message), native: isNative() });
      setError(message.trim() || "Sign-in failed");
      setBusy(false);
    }
  }

  async function chooseAccountRole(picked: "parent" | "provider") {
    setBusy(true);
    setError(null);
    rememberRole(picked);
    markAdultConfirmedForSession();
    try {
      await withTimeoutFallback(setRole({ data: picked }), LOGIN_CONTINUE_MS, undefined);
      try {
        sessionStorage.removeItem(FACEBOOK_ROLE_PENDING_KEY);
      } catch {
        /* private mode */
      }
      continued.current = true;
      await continueAfterSignIn({
        next: search.next,
        desk: deskHint,
        role: picked,
        sticky: readStickyDesk(),
        method: "social",
      });
    } catch {
      const released = releaseStuckLogin("open-failed");
      continued.current = released.keepContinued;
      setError(released.error);
      setBusy(released.busy);
    }
  }

  const pickingRole = search.step === "role" && !facebookSignupRole(role);

  useEffect(() => {
    if (!pickingRole) return;
    try {
      sessionStorage.setItem(FACEBOOK_ROLE_PENDING_KEY, "1");
    } catch {
      /* private mode */
    }
  }, [pickingRole]);

  const title =
    role === "provider" ? t("providerSignIn") : role === "parent" ? t("parentSignIn") : t("signIn");
  const nextPath = (search.next || "").split("?")[0] || "";
  const whyLead = search.why ? t(WHY_LEAD[search.why]) : "";
  const lead = whyLead
      ? whyLead
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
    <Shell>
      <main
        className="ke-auth-viewport mx-auto grid w-full min-w-0 max-w-5xl overflow-x-hidden lg:grid-cols-2"
        data-ke="login-split"
      >
        <div className="relative hidden min-w-0 overflow-hidden lg:block">
          <img
            src="/photos/welcome.jpg"
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
            <h1 className="mt-4 font-display text-2xl sm:mt-6 sm:text-3xl">
              {pickingRole ? t("facebookRoleTitle") : mode === "up" && !operator && role !== "provider" ? t("createParentAccount") : title}
            </h1>
            <p className="mt-2 text-sm text-muted" data-ke="login-lead">
              {pickingRole ? t("facebookRoleLead") : busy && !error ? t("openingDesk") : lead}
            </p>
            {pickingRole ? (
              <div className="mt-6 space-y-3" data-ke="facebook-role">
                <p className="text-sm text-muted">{t("facebookRoleAdult")}</p>
                {error ? (
                  <p className="text-sm text-danger" role="alert">
                    {presentAuthCopy(locale, error)}
                  </p>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  className="w-full min-h-12"
                  disabled={busy || !user}
                  onClick={() => void chooseAccountRole("parent")}
                >
                  {busy ? t("openingDesk") : t("facebookRoleParent")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full min-h-12"
                  disabled={busy || !user}
                  onClick={() => void chooseAccountRole("provider")}
                >
                  {t("facebookRoleCentre")}
                </Button>
              </div>
            ) : null}
            {operator && !user ? (
              <p className="mt-1 text-xs text-subtle" data-ke="admin-titan-note">
                Use email and password for this address.
              </p>
            ) : null}
          {passkeyOffer && !pickingRole ? (
            <PasskeyOffer
              busy={busy}
              error={error}
              onEnable={() => void onEnablePasskey()}
              onLater={() => void onLaterPasskey()}
            />
          ) : (
          <>
          {!operator && !pickingRole && (shownProviders.length > 0 || !authEnabled) ? (
          <div className="mt-6">
            <div data-ke="social-sign-in">
              {authEnabled ? (
                <SocialSignInButtons providers={shownProviders} disabled={busy} onSocial={(id) => void onSocial(id)} />
              ) : (
                <p className="text-sm text-muted">{t("loginDisabled")}</p>
              )}
              <div className="mt-3">
                <ContinueAgeNotice />
              </div>
            </div>
            {authEnabled && shownProviders.length > 0 ? (
              <div className="mt-4 flex items-center gap-3 text-xs uppercase tracking-wider text-subtle">
                <span className="h-px flex-1 bg-border" />
                {t("orEmail")}
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
          </div>
          ) : null}
          <form onSubmit={onEmail} className={`mt-6 space-y-3 ph-no-capture ${pickingRole ? "hidden" : ""}`} data-ke={operator ? "admin-email-first" : "email-sign-in"}>
            {mode === "up" && !operator ? (
              <label className="block text-sm">
                {t("name")}
                <LoginNameControl nameRef={nameRef} />
              </label>
            ) : null}
            <label className="block text-sm">
              {t("email")}
              <LoginEmailControl
                mode={mode}
                emailRef={emailRef}
                onOperator={setOperator}
                onReviewer={setReviewerSignIn}
                onBlurEmail={setEmailLink}
              />
            </label>
            <LoginPasswordControl
              mode={mode}
              showRules={mode === "up" && !operator}
              label={t("password")}
              passwordRef={passwordRef}
            />
            {mode === "up" && !operator ? <ContinueAgeNotice /> : null}
            {parentSignup ? (
              <ParentSmsFields phone={phone} onPhone={setPhone} consent={smsConsent} onConsent={setSmsConsent} />
            ) : null}
            <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
            {error ? <p className="text-sm text-danger" role="alert" data-ke="auth-error">{presentAuthCopy(locale, error)}</p> : null}
            {stalled || error ? (
              <div className="flex flex-wrap gap-3 text-sm" data-ke="login-recovery">
                <button
                  type="button"
                  className="min-h-11 font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    attempt.current += 1;
                    continued.current = true;
                    submitLock.current = false;
                    setError(null);
                    setStalled(false);
                    setBusy(false);
                    resetTurnstile();
                  }}
                >
                  {t("loginRetry")}
                </button>
                <button
                  type="button"
                  className="min-h-11 font-medium text-muted underline-offset-4 hover:underline"
                  onClick={() => openDesk()}
                >
                  {dest.startsWith("/search") ? t("loginBackExplore") : dest.startsWith("/daycare/") ? t("loginBackListing") : t("loginOpenDesk")}
                </button>
                <a href="/parent" className="min-h-11 font-medium text-fg underline underline-offset-4 hover:underline">
                  {t("loginParentDesk")}
                </a>
              </div>
            ) : null}
            {authEnabled && providersReady === false && shownProviders.length === 0 && !operator ? (
              <p className="text-xs text-muted">
                {t("loginMethodsFailed")}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="w-full min-h-12"
              data-ke="email-primary"
              disabled={busy || (turnstileRequired && !token.trim() && !(mode === "in" && reviewerSignIn))}
            >
              {busy ? t("openingDesk") : mode === "up" && !operator ? t("createAccount") : t("signIn")}
            </Button>
            {mode === "in" && !nativeIosSkipsPasskey() ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full min-h-12"
                data-ke="passkey-sign-in"
                disabled={busy}
                onClick={() => void onPasskey()}
              >
                {t("passkeySignIn")}
              </Button>
            ) : null}
          </form>
          {mode === "in" && !pickingRole ? (
            <div className="mt-3">
              <Link
                to="/forgot-password"
                search={{ email: (operator ? OPERATOR_EMAIL : emailLink).trim() }}
                className="text-[13px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {t("forgotPassword")}
              </Link>
              <p className="mt-2 text-[13px] text-muted" data-ke="forgot-password-lead">
                {t("forgotPasswordLead")}
              </p>
            </div>
          ) : null}
          {!operator && !pickingRole ? (
          <button
            type="button"
            className="mt-4 text-sm text-muted underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "up" ? "in" : "up")}
          >
            {mode === "up" ? t("haveAccount") : t("needAccount")}
          </button>
          ) : null}
          </>
          )}
          <p className="mt-6 text-center text-xs text-subtle">
            <a
              href={authBackFallback({ next: search.next, locale: locale === "fr" ? "fr" : "en" })}
              data-ke-auth-back=""
              onClick={(e) => {
                e.preventDefault();
                if (router.history.canGoBack()) {
                  router.history.back();
                  return;
                }
                window.location.replace(currentAuthBackFallback(search.next, locale === "fr" ? "fr" : "en"));
              }}
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
  if (raw.includes("security filter") || raw.includes("cloudflare") || raw.includes("taking too long")) return "cloudflare";
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

