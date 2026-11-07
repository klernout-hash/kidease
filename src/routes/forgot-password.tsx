import { createFileRoute, useRouteContext, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, turnstileFetchOptions } from "@/lib/auth/client";
import { authClientErrorMessage } from "@/lib/auth/login-errors";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { friendlyResetMailError } from "@/lib/auth/reset-errors";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { getResetMailReady } from "@/lib/server/reset-mail";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { Shell } from "@/components/shell";
import { MARKETING_PAGE_SEO, pageSeoHead, withNoindex } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";
import { confirmAction } from "@/lib/success-confirm";
import { isFrPath } from "@/lib/locale-path";

export const forgotPasswordValidateSearch = (s: Record<string, unknown>) => {
  const email = typeof s.email === "string" ? s.email.trim() : "";
  const from = s.from === "gov" ? ("gov" as const) : undefined;
  return {
    ...(email ? { email } : {}),
    ...(from ? { from } : {}),
  };
};

export async function forgotPasswordLoader() {
  const mailReady = await withTimeoutFallback(getResetMailReady(), LOADER_SETTLE_MS, true);
  return { mailReady };
}

export const Route = createFileRoute("/forgot-password")({
  validateSearch: forgotPasswordValidateSearch,
  loader: forgotPasswordLoader,
  head: () => withNoindex(pageSeoHead(MARKETING_PAGE_SEO.forgotPassword)),
  component: ForgotPassword,
});

function ForgotPassword() {
  const { mailReady } = Route.useLoaderData();
  const search = Route.useSearch();
  return <ForgotPasswordScreen mailReady={mailReady} initialEmail={search.email} fromGov={search.from === "gov"} />;
}

export function ForgotPasswordScreen({
  mailReady,
  initialEmail,
  fromGov = false,
}: {
  mailReady: boolean;
  initialEmail?: string;
  fromGov?: boolean;
}) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const frAuthQc = useRouteContext({ from: "__root__" }).frAuthQc === true;
  const frenchDesk = isFrPath(pathname) || (frAuthQc && locale === "fr");
  const resetPath = "/reset-password";
  const resetTo = frenchDesk ? "/fr/reset-password" : resetPath;
  const redirectTo = fromGov ? `${resetTo}?from=gov` : resetTo;
  const signInTo = fromGov ? (frenchDesk ? "/fr/gov/login" : "/gov/login") : locale === "fr" || isFrPath(pathname) ? "/fr/login" : "/login";
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } = useTurnstileToken();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target || !target.includes("@")) {
      setError("Enter the email on the account first.");
      setNote(null);
      return;
    }
    const challenge = takeChallenge();
    if (turnstileRequired && !challenge) {
      setError("Please complete the security check, then try again.");
      setNote(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await authClient.requestPasswordReset({
        email: target,
        redirectTo: redirectTo,
        fetchOptions: turnstileFetchOptions(challenge),
      });
      if (res.error) throw new Error(friendlyResetMailError(authClientErrorMessage(res.error)));
      setNote("If that email is registered with KidEase, we sent a reset link. Check the inbox and junk folder.");
      confirmAction(t, "resetRequested");
    } catch (err) {
      setError(friendlyResetMailError(authClientErrorMessage(err)) || "Could not send a reset email.");
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
          <h1 className="mt-6 font-display text-3xl">{t("forgotPasswordTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("forgotPasswordPageLead")}</p>
          {mailReady ? null : (
            <p className="mt-3 text-sm text-danger">{t("forgotPasswordMailMissing")}</p>
          )}
          <form onSubmit={onSubmit} className="mt-6 space-y-3 ph-no-capture">
            <label className="block text-sm">
              {t("email")}
              <input
                type="email"
                required
                className="ke-input mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
            {error ? <p className="text-sm text-danger">{presentAuthCopy(locale, error)}</p> : null}
            {note ? <p className="text-sm text-muted">{presentAuthCopy(locale, note)}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || (turnstileRequired && !token.trim())}>
              {busy ? t("forgotPasswordSending") : t("forgotPasswordSubmit")}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-subtle">
            <a href={signInTo} className="underline-offset-4 hover:underline">
              {t("backToSignIn")}
            </a>
          </p>
        </div>
      </main>
    </Shell>
  );
}
