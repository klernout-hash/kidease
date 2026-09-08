import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { memo, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getTwoFactorStatus, startTwoFactor, verifyTwoFactor } from "@/lib/server/two-factor";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";

export const Route = createFileRoute("/verify-2fa")({
  validateSearch: (s: Record<string, unknown>) => {
    const next = typeof s.next === "string" && s.next.startsWith("/") ? s.next : "/";
    return { next };
  },
  component: VerifyTwoFactorPage,
});

function VerifyTwoFactorPage() {
  const { user, isPending } = useCurrentUserState();
  const { next } = Route.useSearch();
  const dest = next.startsWith("/") ? next : "/";

  if (isPending) {
    return (
      <Shell bare>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <Shell bare>
      <VerifyTwoFactorForm dest={dest} userId={user.id} />
    </Shell>
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

function VerifyTwoFactorForm({ dest, userId }: { dest: string; userId: string }) {
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const submitLock = useRef(false);
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } =
    useTurnstileToken();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getTwoFactorStatus()
      .then((s) => {
        if (cancelled) return;
        if (s.verified) setVerified(true);
        else {
          return startTwoFactor({ data: { force: false } }).then((res) => {
            if (!cancelled) setHint(res.emailed);
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not send a code");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (verified) return <Navigate to={dest} />;

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
    void verifyTwoFactor({ data: { code, remember: true, turnstileToken: takeChallenge() } })
      .then(() => setVerified(true))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not verify");
        resetTurnstile();
      })
      .finally(() => {
        submitLock.current = false;
        setBusy(false);
      });
  }

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-4.5rem)] place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-card ring-1 ring-border">
        <div className="flex justify-center">
          <BrandMark size="md" />
        </div>
        <h1 className="mt-6 font-display text-3xl">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a 6-digit code{hint ? ` to ${hint}` : ""}. Enter it to finish signing in.
        </p>
        <form className="mt-6 space-y-3 ph-no-capture" onSubmit={onSubmit}>
          <OtpCodeField value={code} onChange={setCode} disabled={busy} />
          <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {notice && !error ? <p className="text-sm text-muted">{notice}</p> : null}
          <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
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
                  return;
                }
                setNotice("A new code is on its way. Use the latest email.");
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Could not send a code"))
              .finally(() => {
                submitLock.current = false;
                setBusy(false);
              });
          }}
        >
          Send a new code
        </button>
        <p className="mt-6 text-center text-xs text-subtle">
          <Link to="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
