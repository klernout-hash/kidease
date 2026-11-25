import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { memo, useEffect, useRef, useState } from "react";
import { ShellLite } from "@/components/shell-lite";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  decideVerify2faSessionGate,
  isGovDeskPath,
  mapAuthSessionUser,
  VERIFY_2FA_SESSION_GRACE_MS,
  verify2faSearchNext,
  verify2faSignedOutTarget,
} from "@/lib/auth/verify-2fa-session";
import { waitForSignedInSession } from "@/lib/auth/session-settle";
import {
  getTwoFactorStatus,
  getVerify2faServerSession,
  startTwoFactor,
  verifyTwoFactor,
} from "@/lib/server/two-factor";
import { hourlyOtpWaitCopy, twoFactorResendWaitCopy } from "@/lib/two-factor-start";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import {
  assignPostAuthDest,
  captureLoginFunnel,
  LOGIN_STALL_MS,
  markContinued,
} from "@/lib/auth/login-funnel";
import { sanitizePostLoginNext, staffTwoFactorRequired } from "@/lib/desks";
import {
  LOGIN_TAKING_TOO_LONG_MESSAGE,
  twoFactorSessionGone,
  twoFactorVerifyErrorMessage,
} from "@/lib/auth/login-stall";
import { isNative } from "@/lib/native";
import { yieldToMain } from "@/lib/yield-main";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { useCopy } from "@/lib/use-copy";
import { isFrPath } from "@/lib/locale-path";

export const verify2faValidateSearch = (s: Record<string, unknown>) => ({
  next: verify2faSearchNext(s.next),
});

export const Route = createFileRoute("/verify-2fa")({
  validateSearch: verify2faValidateSearch,
  head: () => ({
    meta: [
      { title: "Check your sign-in · KidEase" },
      { name: "description", content: "Finish signing in to KidEase. This page is private." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyTwoFactorPage,
});

/**
 * After Google OAuth, `useSession()` can report not-pending + null for a tick
 * (cookie lag). Wait out that grace and poll get-session instead of kicking
 * to /login, which remounts this screen and looks like a 2FA glitch.
 */
function useVerify2faSession() {
  const { user, isPending } = useCurrentUserState();
  const [graceElapsed, setGraceElapsed] = useState(false);
  const [polledUser, setPolledUser] = useState<typeof user>(null);
  // What the cookie session on the server says. null while the answer is on its way.
  const [server, setServer] = useState<{ signedIn: boolean; userId: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVerify2faServerSession()
      .then((res) => {
        if (!cancelled) setServer(res);
      })
      .catch(() => {
        if (!cancelled) setServer({ signedIn: false, userId: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setGraceElapsed(true), VERIFY_2FA_SESSION_GRACE_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (user?.id) return;
    let cancelled = false;
    void waitForSignedInSession(() => authClient.getSession()).then((session) => {
      if (cancelled) return;
      const mapped = mapAuthSessionUser(session?.data?.user ?? null);
      if (mapped) setPolledUser(mapped);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const resolved = user ?? polledUser;
  const serverUserId = server?.signedIn && server.userId ? server.userId : null;
  // The server sees a session the browser has not picked up yet: use its id.
  const serverUser = serverUserId ? mapAuthSessionUser({ id: serverUserId }) : null;
  return {
    user: resolved ?? serverUser,
    phase: decideVerify2faSessionGate({
      hasUser: Boolean(resolved),
      isPending,
      graceElapsed,
      serverSignedIn: server === null ? null : Boolean(serverUserId),
    }),
  };
}

/** Visible while the browser and the server confirm the session. Never a blank page. */
function Verify2faChecking() {
  const { t } = useCopy();
  return (
    <main className="ke-auth-viewport mx-auto grid place-items-center px-4 py-10" data-ke="verify-2fa-session-wait">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-card ring-1 ring-border sm:p-8" aria-busy="true">
        <div className="flex justify-center">
          <BrandMark size="md" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]" role="status">
          {t("verify2faChecking")}
        </h1>
        <p className="mt-2 text-sm text-muted">{t("verify2faCheckingHint")}</p>
      </div>
    </main>
  );
}

/** The sign-in page's language for this screen: /fr/verify-2fa or a French UI. */
function useVerify2faLocale(): "fr" | "en" {
  const { locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return locale === "fr" || isFrPath(pathname) ? "fr" : "en";
}

/**
 * Both the browser and the server say signed out: the half-finished sign-in
 * expired (#1014 item 7). Go to the matching sign-in page with expired=1 and
 * the real destination, never `/` and never back to /verify-2fa.
 */
function Verify2faSignedOut({ dest }: { dest: string }) {
  const routeLocale = useVerify2faLocale();
  const target = verify2faSignedOutTarget(dest, routeLocale);
  useEffect(() => {
    if (isGovDeskPath(dest)) {
      captureLoginFunnel({ step: "failed", reason: "gov_session_missing", native: isNative() });
    }
    window.location.replace(target);
  }, [dest, target]);
  return (
    <ShellLite>
      <Verify2faChecking />
    </ShellLite>
  );
}

function VerifyTwoFactorPage() {
  const { next } = Route.useSearch();
  return <VerifyTwoFactorScreen next={next} />;
}

export function VerifyTwoFactorScreen({ next }: { next?: string }) {
  const { user, phase } = useVerify2faSession();
  const dest = verify2faSearchNext(next);

  if (phase === "wait") {
    return (
      <ShellLite>
        <Verify2faChecking />
      </ShellLite>
    );
  }
  if (phase === "signed_out" || !user) return <Verify2faSignedOut dest={dest} />;

  return (
    <ShellLite>
      <VerifyTwoFactorForm dest={dest} userId={user.id} />
    </ShellLite>
  );
}

const OtpCodeField = memo(function OtpCodeField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        name="one-time-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        pattern="[0-9]*"
        enterKeyHint="done"
        className="ke-input mt-1 tracking-[0.4em]"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        required
        minLength={6}
        maxLength={6}
        disabled={disabled}
      />
    </label>
  );
});

async function leave(rawDest: string) {
  const fallback = sanitizePostLoginNext(rawDest) ?? "/parent";
  markContinued(fallback);
  assignPostAuthDest(fallback);
}

function VerifyTwoFactorForm({ dest, userId }: { dest: string; userId: string }) {
  const { locale, t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signInTo = locale === "fr" || isFrPath(pathname) ? "/fr/login" : "/login";
  // The code email follows the screen's language, not only the QC flag (#1014 item 4).
  const mailLocale: "fr" | "en" = locale === "fr" || isFrPath(pathname) ? "fr" : "en";
  const show = (message: string) => presentAuthCopy(locale, message);
  const staff = staffTwoFactorRequired(dest);
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [delivered, setDelivered] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [pageStalled, setPageStalled] = useState(false);
  // The security check renders on first paint (#1014 item 2). Until Cloudflare
  // hands back a token, Verify stays off with a visible "Loading security check…".
  const [turnstileKey, setTurnstileKey] = useState<"loading" | "on" | "off">("loading");
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [resendWait, setResendWait] = useState(0);
  const submitLock = useRef(false);
  const attempt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef("");
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } =
    useTurnstileToken();
  const turnstileReady = turnstileKey === "off" || (turnstileKey === "on" && (!turnstileRequired || Boolean(token.trim())));
  const turnstileLoading = !turnstileReady && !turnstileError;

  useEffect(() => {
    captureLoginFunnel({ step: "two_factor_viewed", native: isNative() });
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setPageStalled(true), LOGIN_STALL_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => {
      attempt.current += 1;
      submitLock.current = false;
      setBusy(false);
      setStalled(true);
      setError(LOGIN_TAKING_TOO_LONG_MESSAGE);
    }, LOGIN_STALL_MS);
    return () => window.clearTimeout(id);
  }, [busy]);

  useEffect(() => {
    if (resendWait <= 0) return;
    const id = window.setTimeout(() => setResendWait((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendWait]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void yieldToMain().then(() => {
      if (cancelled) return;
      void getTwoFactorStatus()
        .then((s) => {
          if (cancelled) return;
          if (s.verified) {
            captureLoginFunnel({ step: "two_factor_skipped", reason: "already_verified" });
            return leave(dest);
          }
          return startTwoFactor({ data: { force: false, locale: mailLocale } }).then((res) => {
            if (cancelled) return;
            setHint(res.emailed);
            setDelivered(res.sent || Boolean(res.wait) || Boolean("reused" in res && res.reused));
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (twoFactorSessionGone(err instanceof Error ? err.message : "")) {
            window.location.replace(verify2faSignedOutTarget(dest, mailLocale));
            return;
          }
          if (!staff) {
            captureLoginFunnel({ step: "two_factor_skipped", reason: "status_unavailable" });
            return leave(dest);
          }
          setDelivered(false);
          setError(err instanceof Error ? err.message : "Could not send a code. Use Send a new code, or go back to sign in.");
          setCanSkip(false);
        })
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, dest, staff, mailLocale]);

  function explainBlocker(): string | null {
    if (!ready) return "Still sending your code. Try again in a moment.";
    if (code.length !== 6) return "Enter the 6-digit code from your email.";
    if (turnstileRequired && !token.trim()) return "Complete the security check, then tap Verify.";
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || busy) return;
    const blocker = explainBlocker();
    if (blocker) {
      setError(blocker);
      return;
    }
    submitLock.current = true;
    const id = ++attempt.current;
    setBusy(true);
    setStalled(false);
    setError(null);
    void yieldToMain()
      .then(() => verifyTwoFactor({ data: { code, remember, turnstileToken: takeChallenge() } }))
      .then(() => {
        captureLoginFunnel({ step: "two_factor_verified", native: isNative() });
        return leave(dest);
      })
      .catch((err) => {
        if (attempt.current !== id) return;
        const raw = err instanceof Error ? err.message : "Could not verify";
        if (twoFactorSessionGone(raw)) {
          // The half-finished sign-in is gone: send them to sign in again, with the notice.
          captureLoginFunnel({ step: "two_factor_failed", reason: "session_expired", native: isNative() });
          window.location.replace(verify2faSignedOutTarget(dest, mailLocale));
          return;
        }
        captureLoginFunnel({ step: "two_factor_failed", reason: "code", native: isNative() });
        setError(twoFactorVerifyErrorMessage(raw));
        resetTurnstile();
      })
      .finally(() => {
        if (attempt.current !== id) return;
        submitLock.current = false;
        setBusy(false);
      });
  }

  function onCodeChange(nextCode: string) {
    setCode(nextCode);
  }

  // Auto-submit once per typed code, as soon as the code, the sent email and
  // the security check are all ready. A failed code is not re-sent when a
  // fresh Turnstile token arrives; the user edits the code or taps Verify.
  useEffect(() => {
    if (code.length !== 6) {
      autoSubmitted.current = "";
      return;
    }
    if (!ready || busy || submitLock.current || !turnstileReady) return;
    if (autoSubmitted.current === code) return;
    autoSubmitted.current = code;
    void yieldToMain().then(() => {
      if (!submitLock.current) formRef.current?.requestSubmit();
    });
  }, [code, ready, busy, turnstileReady]);

  return (
    <main className="ke-auth-viewport ke-auth-top mx-auto grid place-items-center px-4 py-10" data-ke="verify-2fa">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-card ring-1 ring-border sm:p-8">
        <div className="flex justify-center">
          <BrandMark size="md" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">
          {show("Check your email")}
        </h1>
        <p className="mt-2 text-sm text-muted" data-ke="otp-send-copy">
          {show(
            delivered === false
              ? "We could not email a sign-in code. Nothing was sent. Try Send a new code, or email support@kidease.ca."
              : `We sent a 6-digit code${hint ? ` to ${hint}` : ""}. Enter it to finish signing in.`,
          )}
        </p>
        <form ref={formRef} method="post" action={isFrPath(pathname) ? "/fr/verify-2fa" : "/verify-2fa"} className="mt-6 space-y-3 ph-no-capture" onSubmit={onSubmit}>
          <OtpCodeField value={code} onChange={onCodeChange} disabled={busy} label={show("Verification code")} />
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={busy}
              autoComplete="off"
              autoCorrect="off"
              name="kidease-remember-device"
              data-ke="remember-device"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
            />
            <span>
              <span className="font-medium">{show("Remember this device for 30 days")}</span>
              <span className="mt-1 block text-[12px] text-muted">
                {show("Skip the email code on this browser for 30 days. Do not use this on a shared computer.")}
              </span>
            </span>
          </label>
          <TurnstileField
            onToken={onToken}
            resetSignal={resetSignal}
            onRequired={onRequired}
            onKeyState={setTurnstileKey}
            onLoadError={setTurnstileError}
          />
          {turnstileLoading ? (
            <p className="text-sm text-muted" role="status" data-ke="verify-turnstile-loading">
              {t("verify2faTurnstileLoading")}
            </p>
          ) : null}
          {error ? <p className="text-sm text-danger" data-ke="auth-error">{show(error)}</p> : null}
          {notice && !error ? <p className="text-sm text-muted">{show(notice)}</p> : null}
          {stalled ? (
            <p className="text-sm text-muted" data-ke="verify-stall">
              {show("Still opening your desk. You can send a new code, or continue below.")}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full min-h-12"
            disabled={busy || !turnstileReady}
            aria-busy={busy}
            data-ke="verify-submit"
          >
            {busy ? show("Opening your desk…") : show("Verify and continue")}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 min-h-11 text-sm text-muted underline-offset-4 hover:underline disabled:no-underline disabled:opacity-70"
          disabled={busy || resendWait > 0}
          data-ke="resend-code"
          onClick={() => {
            if (submitLock.current || busy || resendWait > 0) return;
            submitLock.current = true;
            setBusy(true);
            setError(null);
            setNotice(null);
            void startTwoFactor({ data: { force: true, locale: mailLocale } })
              .then((res) => {
                setHint(res.emailed);
                if (!res.sent) {
                  const seconds = "waitSeconds" in res && typeof res.waitSeconds === "number" ? res.waitSeconds : 0;
                  if (seconds > 0) {
                    setResendWait(seconds);
                    const hourly = "hourly" in res && res.hourly;
                    setNotice(hourly ? hourlyOtpWaitCopy(seconds) : twoFactorResendWaitCopy(seconds));
                  } else {
                    setDelivered(false);
                    setError("Please wait a moment, then try Send a new code again.");
                  }
                  if (!staff) setCanSkip(true);
                  return;
                }
                setDelivered(true);
                setNotice("A new code is on its way. Use the latest email.");
              })
              .catch((err) => {
                setDelivered(false);
                setError(err instanceof Error ? err.message : "Could not send a code. Email support@kidease.ca.");
                if (!staff) setCanSkip(true);
              })
              .finally(() => {
                submitLock.current = false;
                setBusy(false);
              });
          }}
        >
          {resendWait > 0 ? show(twoFactorResendWaitCopy(resendWait)) : show("Send a new code")}
        </button>
        {(canSkip || stalled || pageStalled) && !staff ? (
          <button
            type="button"
            className="mt-3 block min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline"
            disabled={busy && !stalled && !pageStalled}
            onClick={() => {
              captureLoginFunnel({
                step: "two_factor_skipped",
                reason: stalled || pageStalled ? "stall_continue" : "continue_without_code",
              });
              void leave(dest);
            }}
          >
            {show("Continue to your desk")}
          </button>
        ) : null}
        <p className="mt-6 text-center text-xs text-subtle">
          <Link to={signInTo} className="underline-offset-4 hover:underline">
            {show("Back to sign in")}
          </Link>
          {delivered === false ? (
            <>
              {" · "}
              <a href="mailto:support@kidease.ca" className="underline-offset-4 hover:underline">
                {show("Email support@kidease.ca")}
              </a>
            </>
          ) : null}
        </p>
      </div>
    </main>
  );
}
