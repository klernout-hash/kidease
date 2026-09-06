import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, turnstileFetchOptions } from "@/lib/auth/client";
import { friendlyResetMailError } from "@/lib/auth/reset-errors";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === "string" ? s.email : "",
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { token, onToken } = useTurnstileToken();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target || !target.includes("@")) {
      setError("Enter the email on the account first.");
      setNote(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await authClient.forgetPassword({
        email: target,
        redirectTo: "/reset-password",
        fetchOptions: turnstileFetchOptions(token),
      });
      if (res.error) throw new Error(friendlyResetMailError(res.error.message));
      setNote("If that email is registered with KidEase, we sent a reset link. Check the inbox and junk folder.");
    } catch (err) {
      setError(err instanceof Error ? friendlyResetMailError(err.message) : "Could not send a reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell bare>
      <main className="mx-auto grid min-h-[calc(100dvh-4.5rem)] place-items-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-card ring-1 ring-border">
          <div className="flex justify-center">
            <BrandMark size="md" />
          </div>
          <h1 className="mt-6 font-display text-3xl">Forgot password</h1>
          <p className="mt-2 text-sm text-muted">
            Enter the email on the account. If it is registered, we email a reset link that expires in about an hour.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3 ph-no-capture">
            <label className="block text-sm">
              Email
              <input
                type="email"
                required
                className="ke-input mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <TurnstileField onToken={onToken} />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {note ? <p className="text-sm text-muted">{note}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Email reset link"}
            </Button>
          </form>
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
