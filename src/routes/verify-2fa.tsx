import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const { token, onToken } = useTurnstileToken();

  useEffect(() => {
    if (!user) return;
    void getTwoFactorStatus()
      .then((s) => {
        if (s.verified) setVerified(true);
        else {
          return startTwoFactor().then((res) => setHint(res.emailed));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not send a code"))
      .finally(() => setReady(true));
  }, [user]);

  if (isPending) {
    return (
      <Shell bare>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (verified) return <Navigate to={dest} />;

  return (
    <Shell bare>
      <main className="mx-auto grid min-h-[calc(100dvh-4.5rem)] place-items-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-card ring-1 ring-border">
          <div className="flex justify-center">
            <BrandMark size="md" />
          </div>
          <h1 className="mt-6 font-display text-3xl">Check your email</h1>
          <p className="mt-2 text-sm text-muted">
            We sent a 6-digit code{hint ? ` to ${hint}` : ""}. Enter it to finish signing in.
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              void verifyTwoFactor({ data: { code, remember: true, turnstileToken: token } })
                .then(() => setVerified(true))
                .catch((err) => setError(err instanceof Error ? err.message : "Could not verify"))
                .finally(() => setBusy(false));
            }}
          >
            <label className="block text-sm">
              Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                className="ke-input mt-1 tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                minLength={6}
                maxLength={6}
              />
            </label>
            <TurnstileField onToken={onToken} />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !ready || code.length !== 6}>
              Verify and continue
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 text-sm text-muted underline-offset-4 hover:underline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void startTwoFactor()
                .then((res) => setHint(res.emailed))
                .catch((err) => setError(err instanceof Error ? err.message : "Could not send a code"))
                .finally(() => setBusy(false));
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
    </Shell>
  );
}
