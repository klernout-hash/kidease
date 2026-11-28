import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient, dropExistingSession, signOut, turnstileFetchOptions } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authClientErrorMessage, friendlyAuthError } from "@/lib/auth/login-errors";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { tx } from "@/lib/copy-runtime";
import { useCopy } from "@/lib/use-copy";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { Button } from "@/components/ui/button";
import { celebrateAfterNavigation } from "@/lib/success-confirm";
import { govCopy, govNativeNoteLinks, govPath } from "@/lib/gov/copy";
import type { GovLocale } from "@/lib/gov/aggregate";
import { GovHelp } from "@/components/gov/gov-help";
import { getGovSession } from "@/lib/server/gov-portal";
import { govVerifyPath } from "@/lib/gov/second-factor";
import { acceptGovInviteFn } from "@/lib/server/gov-admin";

async function openGovWebsite(url: string): Promise<void> {
  const { isNative } = await import("@/lib/native");
  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch {
      /* old binary without the Browser plugin: fall through */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * N-31 / P0-6 / N-08: the one Government screen in the store apps.
 * Government wording (not Admin), no parent or daycare rail, one primary
 * "Open kidease.ca" button, and a Sign out that works on the first tap.
 */
export function GovNativeNote({ locale }: { locale: GovLocale }) {
  const copy = govCopy(locale);
  const links = govNativeNoteLinks(locale);
  const { user, isPending } = useCurrentUserState();
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
      data-ke="gov-native-note"
    >
      <p className="text-sm font-semibold text-primary">KidEase</p>
      <h1 className="mt-2 font-display text-[clamp(1.75rem,6vw,2.25rem)] leading-tight">
        {copy.nativeTitle}
      </h1>
      <p className="mt-3 text-base">{copy.nativeBody}</p>
      <Button
        type="button"
        size="lg"
        className="mt-8 w-full touch-manipulation"
        data-ke="gov-native-open-website"
        onClick={() => void openGovWebsite(links.websiteUrl)}
      >
        {copy.nativeOpenWebsite}
      </Button>
      {user ? (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="mt-3 w-full touch-manipulation"
          data-ke="gov-native-sign-out"
          onClick={() => void signOut(links.signOutTo)}
        >
          {copy.signOut}
        </Button>
      ) : isPending ? null : (
        <p className="mt-6 text-sm text-muted" data-ke="gov-native-signed-out">
          {copy.nativeSignedOut}{" "}
          <Link
            to={locale === "fr" ? "/fr" : "/"}
            className="inline-flex min-h-11 items-center font-medium text-primary"
          >
            {copy.home}
          </Link>
        </p>
      )}
    </main>
  );
}


export function GovClosedNote({ locale }: { locale: GovLocale }) {
  const copy = govCopy(locale);
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16" data-ke="gov-closed">
      <h1 className="font-display text-3xl">{copy.loginTitle}</h1>
      <p className="mt-3 text-base">
        {locale === "fr"
          ? "Le bureau gouvernemental n’est pas ouvert dans ce navigateur. Vous restez ici, pas sur la page des parents."
          : "The government desk is not open in this browser. You stay here, not on the parent home."}
      </p>
      <p className="mt-6">
        <a href={locale === "fr" ? "/fr" : "/"} className="inline-flex min-h-11 items-center font-medium text-primary">
          {copy.home}
        </a>
      </p>
    </main>
  );
}

export function GovLogin({ locale, invite, expired = false }: { locale: GovLocale; invite: string; expired?: boolean }) {
  const copy = govCopy(locale);
  // Subscribes to the French copy pack so translated auth errors render once it loads.
  useCopy();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "script"
      ? locale === "fr"
        ? "La connexion ne s’est pas chargée. Actualisez la page, puis réessayez."
        : "Sign-in did not load. Refresh the page and try again."
      : "",
  );
  const [busy, setBusy] = useState(false);
  const { token, onToken, takeChallenge, resetSignal, required: turnstileRequired, onRequired } = useTurnstileToken();
  // Like /login: wait for the security check so its error rarely shows at all.
  const waitingForCheck = turnstileRequired && !token.trim();
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
          callbackURL: home,
          fetchOptions: turnstileFetchOptions(takeChallenge()),
        });
        if (signed.error) throw new Error(friendlyAuthError(authClientErrorMessage(signed.error)));
      } else {
        const signed = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: home,
          fetchOptions: turnstileFetchOptions(takeChallenge()),
        });
        if (signed.error) throw new Error(friendlyAuthError(authClientErrorMessage(signed.error)));
      }
      const session = await getGovSession();
      if (!session.ok && "needSecondFactor" in session && session.needSecondFactor) {
        // A government account needs the email code next. Keep the session and
        // send the officer to the code page instead of signing them out.
        window.location.assign(govVerifyPath(locale, home));
        return;
      }
      if (!session.ok) {
        await dropExistingSession();
        setError(copy.denied);
        return;
      }
      celebrateAfterNavigation();
      window.location.assign(home);
    } catch (err) {
      setError(friendlyAuthError(authClientErrorMessage(err)) || copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full min-h-dvh overflow-x-hidden bg-bg text-fg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[var(--ke-safe-left,env(safe-area-inset-left))] pr-[var(--ke-safe-right,env(safe-area-inset-right))]">
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
        {expired && !error ? (
          <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm" role="status" data-ke="gov-login-expired">
            {tx(locale, "authSignInTimedOut")}
          </p>
        ) : null}
        <form method="post" action={locale === "fr" ? "/fr/gov/login" : "/gov/login"} className="mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
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
          <p>
            <a
              href={locale === "fr" ? "/fr/forgot-password?from=gov" : "/forgot-password?from=gov"}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              data-ke="gov-forgot-password"
            >
              {locale === "fr" ? "Mot de passe oublié ?" : "Forgot password?"}
            </a>
          </p>
          <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
          {error ? (
            <p className="text-sm text-danger" role="alert" data-ke="gov-login-error">
              {/* Errors are stored in English (funnel matching) and shown in the page language. */}
              {presentAuthCopy(locale, error)}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || waitingForCheck} className="w-full">
            {busy ? copy.signingIn : copy.signIn}
          </Button>
        </form>
      </main>
    </div>
  );
}
