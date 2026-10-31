import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient, dropExistingSession, turnstileFetchOptions } from "@/lib/auth/client";
import { authClientErrorMessage, friendlyAuthError } from "@/lib/auth/login-errors";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { Button } from "@/components/ui/button";
import { govCopy, govPath } from "@/lib/gov/copy";
import type { GovLocale } from "@/lib/gov/aggregate";
import { GovHelp } from "@/components/gov/gov-help";
import { getGovSession } from "@/lib/server/gov-portal.server";
import { acceptGovInviteFn } from "@/lib/server/gov-admin.server";

export function GovNativeNote({ locale }: { locale: GovLocale }) {
  const copy = govCopy(locale);
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16">
      <h1 className="font-display text-3xl">{copy.nativeTitle}</h1>
      <p className="mt-3 text-base">{copy.nativeBody}</p>
      <p className="mt-6">
        <Link to="/" className="inline-flex min-h-11 items-center font-medium text-primary">
          {copy.home}
        </Link>
      </p>
    </main>
  );
}

export function GovLogin({ locale, invite }: { locale: GovLocale; invite: string }) {
  const copy = govCopy(locale);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { onToken, takeChallenge, resetSignal, onRequired } = useTurnstileToken();
  const home = govPath(locale);
  const other = locale === "fr" ? "en" : "fr";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (invite) {
        const created = await acceptGovInviteFn({ data: { token: invite, password, name } });
        if (!created.ok) {
          setError(created.error);
          return;
        }
        const signed = await authClient.signIn.email({
          email: created.email,
          password,
          fetchOptions: turnstileFetchOptions(takeChallenge()),
        });
        if (signed.error) throw new Error(friendlyAuthError(authClientErrorMessage(signed.error)));
      } else {
        const signed = await authClient.signIn.email({
          email: email.trim(),
          password,
          fetchOptions: turnstileFetchOptions(takeChallenge()),
        });
        if (signed.error) throw new Error(friendlyAuthError(authClientErrorMessage(signed.error)));
      }
      const session = await getGovSession();
      if (!session.ok) {
        await dropExistingSession();
        setError(copy.denied);
        return;
      }
      window.location.assign(home);
    } catch (err) {
      setError(friendlyAuthError(authClientErrorMessage(err)) || copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full min-h-dvh overflow-x-hidden bg-bg text-fg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-4">
        <p className="font-display text-lg">KidEase</p>
        <div className="flex items-center gap-2">
          <GovHelp locale={locale} />
          <Link to={govPath(other, "login")} className="inline-flex min-h-11 items-center text-sm font-medium">
            {copy.language}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pb-16" data-ke="gov-login">
        <p className="text-sm font-medium text-muted">{copy.what}</p>
        <h1 className="mt-1 font-display text-3xl">{copy.loginTitle}</h1>
        <p className="mt-2 text-base">{copy.why}</p>
        <p className="mt-2 text-sm text-muted">{copy.next}</p>
        <form className="mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
          {invite ? (
            <label className="block text-sm font-medium">
              {locale === "fr" ? "Votre nom" : "Your name"}
              <input
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          ) : (
            <label className="block text-sm font-medium">
              {copy.email}
              <input
                type="email"
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
          )}
          <label className="block text-sm font-medium">
            {copy.password}
            <input
              type="password"
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={invite ? "new-password" : "current-password"}
              required
              minLength={invite ? 12 : 8}
            />
          </label>
          <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? copy.signingIn : copy.signIn}
          </Button>
        </form>
      </main>
    </div>
  );
}
