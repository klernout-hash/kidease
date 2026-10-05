import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/success-confirm";
import { LICENSING_OFFICES, reportSearchProvince } from "@/lib/licensing-offices";
import { localePath } from "@/lib/locale-path";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { publicFormErrorMessage } from "@/lib/public-form-error";
import { submitPublicMessage } from "@/lib/server/notify";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/report")({
  validateSearch: (search: Record<string, unknown>) => ({
    province: reportSearchProvince(search.province),
  }),
  head: () => pageSeoHead(MARKETING_PAGE_SEO.report),
  component: ReportPage,
});

function scrollField(event: { currentTarget: HTMLElement }) {
  event.currentTarget.scrollIntoView({ block: "center" });
}

export function ReportPage() {
  const { t, locale } = useCopy();
  const provinceFromUrl = useRouterState({
    select: (state) => reportSearchProvince((state.location.search as { province?: unknown }).province),
  });
  const fr = locale === "fr";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [province, setProvince] = useState(provinceFromUrl);
  const [listing, setListing] = useState("");
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
      setFormError(t("turnstileRequired"));
      setSent(false);
      return;
    }
    setBusy(true);
    setFormError(null);
    setSent(false);
    const office = LICENSING_OFFICES.find((row) => row.code === province);
    const place = office ? (fr ? office.nameFr : office.nameEn) : province;
    try {
      await submitPublicMessage({
        data: {
          kind: "support",
          name,
          email,
          subject: place ? `Listing concern: ${place}` : "Listing concern",
          body: [place && `Province: ${place}`, listing && `Listing: ${listing}`, body].filter(Boolean).join("\n"),
          centre: listing,
          turnstileToken: challenge,
        },
      });
      setSent(true);
      confirmAction(t, "contactSent");
      setBody("");
    } catch (err) {
      console.error("[kidease-report]", err);
      const message = publicFormErrorMessage(err, t("contactSendFailed").replace("{email}", SUPPORT_INBOX_EMAIL));
      setFormError(message);
      toast.error(message);
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  const mailto = `mailto:${SUPPORT_INBOX_EMAIL}?subject=${encodeURIComponent("Listing concern")}`;

  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16" data-ke="report-page">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("reportKicker")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("reportTitle")}</h1>
        <p className="mt-6 text-lg text-muted">{t("reportLead")}</p>
        <p className="mt-4 rounded-xl bg-surface p-4 text-sm font-medium ring-1 ring-border">{t("reportEmergency")}</p>
        <p className="mt-4 text-sm leading-6 text-muted">{t("reportAbuse")}</p>

        <section id="offices" className="mt-10 scroll-mt-24">
          <h2 className="text-2xl font-semibold">{t("reportOfficesTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">{t("reportOfficesLead")}</p>
          <ul className="mt-4 space-y-3">
            {LICENSING_OFFICES.map((office) => {
              const note = fr ? office.noteFr : office.noteEn;
              return (
                <li
                  key={office.code}
                  id={office.code}
                  className="scroll-mt-24 rounded-xl bg-surface p-4 ring-1 ring-border"
                >
                  <h3 className="text-lg font-semibold">{fr ? office.nameFr : office.nameEn}</h3>
                  <ul className="mt-2 space-y-1">
                    {office.phones.map((phone) => (
                      <li key={phone.tel}>
                        <a
                          href={`tel:${phone.tel}`}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {fr ? phone.labelFr : phone.labelEn}
                          <span className="mx-1.5" aria-hidden>
                            ·
                          </span>
                          {phone.display}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {note ? <p className="mt-1 text-sm leading-6 text-muted">{note}</p> : null}
                  <a
                    href={office.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("reportOfficialPage")}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="listing-report" className="mt-10 scroll-mt-24">
          <h2 className="text-2xl font-semibold">{t("reportFormTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">{t("reportFormLead")}</p>
          <p className="mt-3 text-sm">
            <a href={mailto} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
              {t("reportOrEmail")} {SUPPORT_INBOX_EMAIL}
            </a>
          </p>

          {sent ? (
            <div className="mt-6 rounded-xl bg-ok/10 p-5 ring-1 ring-ok/30" data-ke="report-thanks" role="status">
              <p className="text-base font-semibold">{t("contactSent")}</p>
            </div>
          ) : (
            <form className="mt-6 space-y-3" onSubmit={send}>
              <label className="block text-sm font-medium">
                {t("name")}
                <input
                  required
                  className="ke-input mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={scrollField}
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
                  onFocus={scrollField}
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm font-medium">
                {t("reportProvince")}
                <select
                  className="ke-input mt-1"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  onFocus={scrollField}
                >
                  <option value="">{t("reportChooseProvince")}</option>
                  {LICENSING_OFFICES.map((office) => (
                    <option key={office.code} value={office.code}>
                      {fr ? office.nameFr : office.nameEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("reportListing")}
                <input
                  className="ke-input mt-1"
                  value={listing}
                  onChange={(e) => setListing(e.target.value)}
                  onFocus={scrollField}
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
                  onFocus={scrollField}
                />
              </label>
              <TurnstileField onToken={onToken} resetSignal={resetSignal} onRequired={onRequired} />
              {formError ? (
                <p className="text-sm text-danger" role="alert">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {t("send")}
              </Button>
            </form>
          )}
          <p className="mt-6 text-sm">
            <Link to={localePath("/help", locale)} className="font-medium text-primary underline-offset-4 hover:underline">
              {t("helpTitle")}
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </Shell>
  );
}
