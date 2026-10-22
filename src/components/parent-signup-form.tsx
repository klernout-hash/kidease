import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient, turnstileFetchOptions } from "@/lib/auth/client";
import { authClientErrorMessage, friendlyAuthError } from "@/lib/auth/login-errors";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { continueAfterSignIn } from "@/lib/auth/login-funnel";
import { parentMobileIssue, smsOptInWasBlocked } from "@/lib/parent-sms-consent";
import { toast } from "sonner";
import { saveParentSmsOptIn } from "@/lib/server/parent-sms-consent";
import { setRole } from "@/lib/server/family";
import { localPasswordIssue } from "@/lib/password-hygiene";
import { LOGIN_CONTINUE_MS, LOGIN_POST_MS } from "@/lib/auth/login-stall";
import { withTimeout, withTimeoutFallback } from "@/lib/timeout";
import { confirmAction } from "@/lib/success-confirm";
import { useCopy } from "@/lib/use-copy";
import { rememberRole } from "@/components/role-boot";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/password-field";
import { PasswordRules } from "@/components/password-rules";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { ParentSmsFields } from "@/components/parent-sms-fields";

function rememberToken(data: { token?: string | null } | null | undefined) {
  const token = data?.token;
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}

export function ParentSignupForm() {
  const { t, locale } = useCopy();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { token, onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } =
    useTurnstileToken();

  const title = locale === "fr" ? "Créer un compte parent" : "Create a parent account";
  const lead =
    locale === "fr"
      ? "KidEase aide les parents à trouver une garderie permise au Canada. Enregistrez un centre, puis demandez une visite."
      : "KidEase helps parents find licensed daycare in Canada. Save a centre, then ask for a tour.";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!adult) {
      setError(locale === "fr" ? "Confirmez que vous avez 18 ans ou plus." : "Confirm you are 18 or older.");
      return;
    }
    setBusy(true);
    try {
      const phoneIssue = parentMobileIssue(phone);
      if (phoneIssue) throw new Error(phoneIssue);
      const hygiene = localPasswordIssue(password, email);
      if (hygiene) throw new Error(hygiene);
      const challenge = takeChallenge();
      if (turnstileRequired && !challenge) {
        throw new Error("Please complete the security check, then try again.");
      }
      const res = await withTimeout(
        authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          fetchOptions: turnstileFetchOptions(challenge),
        }),
        LOGIN_POST_MS,
        "sign-in-timeout",
      );
      if (res.error) throw new Error(friendlyAuthError(authClientErrorMessage(res.error)));
      rememberToken(res.data);
      rememberRole("parent");
      await withTimeoutFallback(setRole({ data: "parent" }), LOGIN_CONTINUE_MS, undefined);
      const savedSms = await withTimeoutFallback(
        saveParentSmsOptIn({ data: { phone, smsConsent } }),
        LOGIN_CONTINUE_MS,
        undefined,
      );
      if (smsOptInWasBlocked(savedSms)) toast.message(t("smsUnreachable"));
      confirmAction(t, "accountCreated");
      await continueAfterSignIn({
        next: "/parent",
        desk: "parent",
        role: "parent",
        method: "email",
      });
    } catch (err) {
      setError(friendlyAuthError(authClientErrorMessage(err)) || "Sign-in failed");
      resetTurnstile();
      setBusy(false);
    }
  }

  return (
    <main className="ke-auth-viewport mx-auto grid w-full min-w-0 place-items-center overflow-x-hidden px-[clamp(0.75rem,3vw,2rem)] py-8 sm:py-10">
      <div className="w-full min-w-0 max-w-md rounded-xl bg-surface p-4 shadow-card ring-1 ring-border sm:p-8">
        <form onSubmit={onSubmit} className="space-y-3 ph-no-capture" data-ke="parent-signup">
          <div className="flex justify-center pb-2">
            <BrandMark size="md" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted">{lead}</p>
          <label className="block text-sm" htmlFor="parent-signup-name">
            {t("name")}
            <input
              id="parent-signup-name"
              className="ke-input mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
              autoComplete="name"
            />
          </label>
          <label className="block text-sm" htmlFor="parent-signup-email">
            {t("email")}
            <input
              id="parent-signup-email"
              type="email"
              required
              className="ke-input mt-1"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
              enterKeyHint="next"
            />
          </label>
          <PasswordField
            label={t("password")}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <PasswordRules password={password} />
          <ParentSmsFields phone={phone} onPhone={setPhone} consent={smsConsent} onConsent={setSmsConsent} />
          <label className="flex min-h-11 items-start gap-3 text-sm" htmlFor="parent-signup-adult">
            <input
              id="parent-signup-adult"
              type="checkbox"
              className="mt-1 size-5"
              checked={adult}
              onChange={(event) => setAdult(event.target.checked)}
              required
            />
            <span>
              {locale === "fr"
                ? "J’ai 18 ans ou plus. KidEase est pour les parents et les garderies."
                : "I am 18 or older. KidEase is for parents and daycares."}
            </span>
          </label>
          <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
          {error ? (
            <p className="text-sm text-danger" role="alert" data-ke="auth-error">
              {presentAuthCopy(locale, error)}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="w-full min-h-12"
            data-ke="parent-signup-submit"
            disabled={busy || (turnstileRequired && !token.trim())}
          >
            {busy ? t("openingDesk") : t("createAccount")}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          <Link
            to="/login"
            search={{ intent: "in", role: "parent", desk: "parent" }}
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            {t("haveAccount")}
          </Link>
        </p>
      </div>
    </main>
  );
}
