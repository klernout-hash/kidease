import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/success-confirm";
import { FeelBanner } from "@/components/building-photo";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { submitPublicMessage } from "@/lib/server/notify";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { publicFormErrorMessage } from "@/lib/public-form-error";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import { companyAddress, PRIVACY_CONTACT_EMAIL } from "@/lib/company";
import { safetyText } from "@/lib/safety";
import { ParentHelperPanel } from "@/components/parent-helper";
import { localePath } from "@/lib/locale-path";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/help")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.help),
  component: Help,
});

export function Help() {
  const { t, locale } = useCopy();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { onToken, reset: resetTurnstile, takeChallenge, resetSignal, required: turnstileRequired, onRequired } =
    useTurnstileToken();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const challenge = takeChallenge();
    if (turnstileRequired && !challenge) {
      setFormError("Please complete the security check, then try again.");
      setSent(false);
      return;
    }
    setBusy(true);
    setFormError(null);
    setSent(false);
    try {
      await submitPublicMessage({
        data: { kind: "support", name, email, body, turnstileToken: challenge },
      });
      setSent(true);
      confirmAction(t, "contactSent");
      setBody("");
    } catch (err) {
      console.error("[kidease-contact]", err);
      const message = publicFormErrorMessage(
        err,
        t("contactSendFailed").replace("{email}", SUPPORT_INBOX_EMAIL),
      );
      setFormError(message);
      toast.error(message);
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg py-12 md:py-16">
        <p className="ke-kicker">{t("helpKicker")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("helpTitle")}</h1>
        <p className="mt-6 text-muted">{t("supportLead")}</p>
        <p className="mt-4">
          <Link
            to={localePath("/report", locale)}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("reportSafetyConcern")}
          </Link>
        </p>
        <SafetyContact locale={locale} />
        <ParentHelperPanel />
        <FeelBanner src="/photos/cottage.jpg" className="mt-8" />

        <div className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border">
          <p className="text-sm font-semibold">{t("contactDirect")}</p>
          <a
            href={`mailto:${SUPPORT_INBOX_EMAIL}`}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline max-md:flex max-md:max-w-full"
          >
            <Mail className="size-4 max-md:shrink-0" aria-hidden />
            <span className="min-w-0 max-md:break-all">{SUPPORT_INBOX_EMAIL}</span>
          </a>
        </div>

        {sent ? (
          <div
            className="mt-8 rounded-xl bg-ok/10 p-5 ring-1 ring-ok/30"
            data-ke="help-thanks"
            role="status"
          >
            <p className="text-base font-semibold">{t("supportSent")}</p>
          </div>
        ) : (
        <form className="mt-8 space-y-3" onSubmit={send}>
          <label className="block text-sm font-medium">
            {t("name")}
            <input
              required
              className="ke-input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="block text-sm font-medium">
            {t("email")}
            <input
              required
              type="email"
              className="ke-input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block text-sm font-medium">
            {t("writeMessage")}
            <textarea
              required
              rows={5}
              className="ke-textarea mt-1"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
          {formError ? (
            <p className="text-sm text-danger" data-ke="help-error" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {t("send")}
          </Button>
        </form>
        )}
      </main>
    </Shell>
  );
}

function SafetyContact({ locale }: { locale: string }) {
  const text = safetyText(locale);
  const address = companyAddress(locale === "fr" ? "fr" : "en");
  return (
    <section className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="safety-contact">
      <h2 className="font-display text-2xl">{text.helpTitle}</h2>
      <p className="mt-2 text-sm text-muted">{text.helpLead}</p>
      <p className="mt-2 text-sm text-muted">{text.helpReview}</p>
      <ul className="mt-4 space-y-2 text-sm">
        <li>
          <span className="font-medium">{text.helpEmail}: </span>
          <a className="max-md:break-all text-primary underline-offset-4 hover:underline" href={`mailto:${SUPPORT_INBOX_EMAIL}`}>
            {SUPPORT_INBOX_EMAIL}
          </a>
        </li>
        <li>
          <span className="font-medium">{text.helpPrivacy}: </span>
          <a className="max-md:break-all text-primary underline-offset-4 hover:underline" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
            {PRIVACY_CONTACT_EMAIL}
          </a>
        </li>
        {address ? (
          <li>
            <span className="font-medium">{text.helpMail}: </span>
            {address}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
