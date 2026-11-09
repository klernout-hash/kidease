import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, turnstileFetchOptions } from "@/lib/auth/client";
import { authClientErrorMessage, friendlyAuthError } from "@/lib/auth/login-errors";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { PasswordField } from "@/components/password-field";
import { useSuccessConfirm } from "@/components/use-success-confirm";
import { Shell } from "@/components/shell";
import { MARKETING_PAGE_SEO, pageSeoHead, withNoindex } from "@/lib/page-seo";
import { PasswordRules } from "@/components/password-rules";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { useCopy } from "@/lib/use-copy";
import { localPasswordIssue, PASSWORD_POLICY_HINT, passwordMeetsPolicy } from "@/lib/password-hygiene";
import { isFrPath } from "@/lib/locale-path";

export const resetPasswordValidateSearch = (s: Record<string, unknown>) => ({
  token: typeof s.token === "string" ? s.token : "",
  from: s.from === "gov" ? ("gov" as const) : undefined,
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordValidateSearch,
  head: () => withNoindex(pageSeoHead(MARKETING_PAGE_SEO.resetPassword)),
  component: ResetPassword,
});

function ResetPassword() {
  const { token, from } = Route.useSearch();
  return <ResetPasswordScreen token={token} fromGov={from === "gov"} />;
}

export function ResetPasswordScreen({ token, fromGov = false }: { token: string; fromGov?: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const french = locale === "fr" || isFrPath(pathname);
  const signInTo = fromGov ? (french ? "/fr/gov/login" : "/gov/login") : french ? "/fr/login" : "/login";
  const forgotTo = french ? "/fr/forgot-password" : "/forgot-password";
  const formAction = isFrPath(pathname) ? "/fr/reset-password" : "/reset-password";
  const { celebrate } = useSuccessConfirm();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const { token: challenge, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } = useTurnstileToken();
  const ready = passwordMeetsPolicy(password) && password === confirm && Boolean(token);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hygiene = localPasswordIssue(password);
    if (hygiene) {
      setError(hygiene);
      return;
    }
    if (!passwordMeetsPolicy(password)) {
      setError(PASSWORD_POLICY_HINT);
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
    const turnstile = takeChallenge();
    if (turnstileRequired && !turnstile) {
      setError("Please complete the security check, then try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token,
        fetchOptions: turnstileFetchOptions(turnstile),
      });
      if (res.error) throw new Error(friendlyAuthError(authClientErrorMessage(res.error)) || "Could not reset the password.");
      setDone(true);
      celebrate();
    } catch (err) {
      setError(friendlyAuthError(authClientErrorMessage(err)) || "Could not reset the password.");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="ke-auth-viewport mx-auto grid place-items-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-card ring-1 ring-border">
          <div className="flex justify-center">
            <BrandMark size="md" />
          </div>
          <h1 className="mt-6 font-display text-3xl">{t("resetPasswordTitle")}</h1>
          {done ? (
            <>
              <p className="mt-3 text-sm text-muted">{t("resetPasswordDone")}</p>
              <a href={signInTo} className="mt-6 inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline">
                {t("backToSignIn")}
              </a>
            </>
          ) : !token ? (
            <>
              <p className="mt-3 text-sm text-danger">{t("resetPasswordMissing")}</p>
              <Link to={forgotTo} className="mt-6 inline-flex text-sm text-primary underline-offset-4 hover:underline">
                {t("resetPasswordNewLink")}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">{t("resetPasswordLead")}</p>
              <form method="post" action={formAction} onSubmit={onSubmit} className="mt-6 space-y-3 ph-no-capture">
                <PasswordField
                  label={t("resetPasswordNew")}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <PasswordRules password={password} />
                <PasswordField
                  label={t("resetPasswordConfirm")}
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                {confirm && confirm !== password ? (
                  <p className="text-[13px] text-danger">{t("resetPasswordMismatch")}</p>
                ) : null}
                <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
                {error ? <p className="text-sm text-danger">{presentAuthCopy(locale, error)}</p> : null}
                <Button type="submit" className="w-full" disabled={busy || !ready || (turnstileRequired && !challenge.trim())}>
                  {t("resetPasswordSave")}
                </Button>
              </form>
              <p className="mt-6 text-center text-xs text-subtle">
                <a href={signInTo} className="underline-offset-4 hover:underline">
                  {t("backToSignIn")}
                </a>
              </p>
            </>
          )}
        </div>
      </main>
    </Shell>
  );
}
