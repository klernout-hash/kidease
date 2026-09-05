import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { submitPublicMessage } from "@/lib/server/notify";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import type { CopyKey } from "@/lib/copy";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

export const Route = createFileRoute("/contact")({
  validateSearch: (s: Record<string, unknown>) => {
    if (s.intent === "parent") return { intent: "parent" as const };
    return {};
  },
  component: Contact,
});

const SUBJECTS: CopyKey[] = [
  "subjectCare",
  "subjectGeneral",
  "subjectListing",
  "subjectTech",
  "subjectPartner",
  "subjectOther",
];

export function Contact() {
  const { t } = useCopy();
  const search = Route.useSearch();
  const isParent = search.intent === "parent";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<CopyKey>(isParent ? "subjectCare" : "subjectGeneral");
  const [body, setBody] = useState("");

  const [busy, setBusy] = useState(false);
  const { token, onToken } = useTurnstileToken();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const label = t(subject);
      await submitPublicMessage({
        data: {
          kind: "contact",
          name,
          email,
          subject: isParent ? `${t("roleParentTitle")} — ${label}` : label,
          body,
          turnstileToken: token,
        },
      });
      toast.success(t("contactSent"));
      setBody("");
    } catch (err) {
      console.error("[kidease-contact]", err);
      toast.error(`Could not send. Email ${SUPPORT_INBOX_EMAIL} directly.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-lg py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("contact")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{isParent ? t("parentContactTitle") : t("contactTitle")}</h1>
        <p className="mt-6 text-muted">{isParent ? t("parentContactIntro") : t("contactIntro")}</p>

        {isParent ? null : (
          <div className="mt-8 rounded-xl bg-surface p-5 text-center ring-1 ring-border">
            <p className="text-base font-semibold">{t("daycareEnrollLead")}</p>
            <Button asChild size="lg" className="mt-4 w-full">
              <Link to="/claim" hash="enroll">
                {t("enrollNow")}
              </Link>
            </Button>
          </div>
        )}

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
            {t("contactSubject")}
            <select
              className="ke-input mt-1"
              value={subject}
              onChange={(e) => setSubject(e.target.value as CopyKey)}
            >
              {SUBJECTS.map((key) => (
                <option key={key} value={key}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {t("messageLabel")}
            <textarea
              required
              rows={6}
              className="ke-textarea mt-1"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <TurnstileField onToken={onToken} />
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {t("submit")}
          </Button>
        </form>

        <div className="mt-10 rounded-xl bg-surface p-5 ring-1 ring-border">
          <p className="text-sm font-semibold">{t("contactDirect")}</p>
          <a
            href={`mailto:${SUPPORT_INBOX_EMAIL}`}
            className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Mail className="size-4" />
            {SUPPORT_INBOX_EMAIL}
          </a>
          <p className="mt-3 text-sm text-muted">{t("contactResponse")}</p>
          <p className="mt-3 text-sm text-muted">{t("contactLocation")}</p>
          <p className="mt-3 text-xs text-subtle">{t("contactPrivacy")}</p>
        </div>
      </main>
      <SiteFooter />
    </Shell>
  );
}
