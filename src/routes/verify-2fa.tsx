import { createFileRoute, Link } from "@tanstack/react-router";
import { memo, useEffect, useRef, useState } from "react";
import { ShellLite } from "@/components/shell-lite";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { DeskSkeleton } from "@/components/page-skeleton";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getTwoFactorStatus, startTwoFactor, verifyTwoFactor } from "@/lib/server/two-factor";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import {
  assignPostAuthDest,
  captureLoginFunnel,
  LOGIN_STALL_MS,
  markContinued,
} from "@/lib/auth/login-funnel";
import { sanitizePostLoginNext, staffTwoFactorRequired } from "@/lib/desks";
import { isNative } from "@/lib/native";
import { yieldToMain } from "@/lib/yield-main";

export const Route = createFileRoute("/verify-2fa")({
  validateSearch: (s: Record<string, unknown>) => {
    const raw = typeof s.next === "string" ? s.next : "";
    const next = sanitizePostLoginNext(raw) ?? (raw.startsWith("/") && !raw.startsWith("//") ? raw : "/parent");
    return { next: sanitizePostLoginNext(next) ?? "/parent" };
  },
  component: VerifyTwoFactorPage,
});

function VerifyTwoFactorPage() {
  const { user, isPending } = useCurrentUserState();
  const { next } = Route.useSearch();
  const dest = sanitizePostLoginNext(next) ?? "/parent";

  if (isPending) {
    return (
      <ShellLite>
        <DeskSkeleton />
      </ShellLite>
    );
  }
  if (!user) return <RedirectToSignIn />;

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
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block text-sm">
      Verification code
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
  const staff = staffTwoFactorRequired(dest);
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [pageStalled, setPageStalled] = useState(false);
  const [needTurnstile, setNeedTurnstile] = useState(false);
  const submitLock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } =
    useTurnstileToken();

  useEffect(() => {
    captureLoginFunnel({ step: "two_factor_viewed", native: isNative() });
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setPageStalled(true), LOGIN_STALL_MS);
    return () => window.clearTimeout(id);
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
          return startTwoFactor({ data: { force: false } }).then((res) => {
            if (!cancelled) setHint(res.emailed);
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (!staff) {
            captureLoginFunnel({ step: "two_factor_skipped", reason: "status_unavailable" });
            return leave(dest);
          }
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
  }, [userId, dest, staff]);

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
    setBusy(true);
    setError(null);
    void yieldToMain()
      .then(() => verifyTwoFactor({ data: { code, remember: true, turnstileToken: takeChallenge() } }))
      .then(() => {
        captureLoginFunnel({ step: "two_factor_verified", native: isNative() });
        return leave(dest);
      })
      .catch((err) => {
        captureLoginFunnel({ step: "two_factor_failed", reason: "code", native: isNative() });
        setError(err instanceof Error ? err.message : "Could not verify");
        resetTurnstile();
      })
      .finally(() => {
        submitLock.current = false;
        setBusy(false);
      });
  }

  function onCodeChange(nextCode: string) {
    setCode(nextCode);
    if (nextCode.length > 0 && !needTurnstile) setNeedTurnstile(true);
    const turnstileReady = !turnstileRequired || Boolean(token.trim());
    if (nextCode.length === 6 && ready && !busy && !submitLock.current && turnstileReady) {
      void yieldToMain().then(() => {
        if (!submitLock.current) formRef.current?.requestSubmit();
      });
    }
  }

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-4.5rem)] place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-card ring-1 ring-border sm:p-8">
        <div className="flex justify-center">
          <BrandMark size="md" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted">
          We sent a 6-digit code{hint ? ` to ${hint}` : ""}. Enter it to finish signing in.
        </p>
        <form ref={formRef} className="mt-6 space-y-3 ph-no-capture" onSubmit={onSubmit}>
          <OtpCodeField value={code} onChange={onCodeChange} disabled={busy} />
          {needTurnstile ? (
            <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
          ) : (
            <div className="min-h-[65px]" aria-hidden="true" />
          )}
          {error ? <p className="text-sm text-danger" data-ke="auth-error">{error}</p> : null}
          {notice && !error ? <p className="text-sm text-muted">{notice}</p> : null}
          {stalled ? (
            <p className="text-sm text-muted" data-ke="verify-stall">
              Still opening your desk. You can send a new code, or continue below.
            </p>
          ) : null}
          <Button type="submit" className="w-full min-h-12" disabled={busy} aria-busy={busy}>
            {busy ? "Opening your desk…" : "Verify and continue"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 min-h-11 text-sm text-muted underline-offset-4 hover:underline"
          disabled={busy}
          onClick={() => {
            if (submitLock.current || busy) return;
            submitLock.current = true;
            setBusy(true);
            setError(null);
            setNotice(null);
            void startTwoFactor({ data: { force: true } })
              .then((res) => {
                setHint(res.emailed);
                if (!res.sent) {
                  setError("Please wait a moment, then try Send a new code again.");
                  if (!staff) setCanSkip(true);
                  return;
                }
                setNotice("A new code is on its way. Use the latest email.");
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : "Could not send a code");
                if (!staff) setCanSkip(true);
              })
              .finally(() => {
                submitLock.current = false;
                setBusy(false);
              });
          }}
        >
          Send a new code
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
            Continue to your desk
          </button>
        ) : null}
        <p className="mt-6 text-center text-xs text-subtle">
          <Link to="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
