import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    if (!token) {
      setError("This reset link is missing or expired. Request a new one from the sign-in page.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) throw new Error(res.error.message || "Could not reset the password.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
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
          <h1 className="mt-6 font-display text-3xl">Choose a new password</h1>
          {done ? (
            <>
              <p className="mt-3 text-sm text-muted">Your password is updated. Sign in with the new one.</p>
              <Link to="/login" className="mt-6 inline-flex text-sm text-primary underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">This works for Parent, Daycare, and Operator accounts.</p>
              <form onSubmit={onSubmit} className="mt-6 space-y-3">
                <label className="block text-sm">
                  New password
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="ke-input mt-1"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block text-sm">
                  Confirm password
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="ke-input mt-1"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  Save new password
                </Button>
              </form>
              <p className="mt-6 text-center text-xs text-subtle">
                <Link to="/login" className="underline-offset-4 hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </Shell>
  );
}
