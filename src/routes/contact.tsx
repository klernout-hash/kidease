import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { submitPublicMessage } from "@/lib/server/notify";
import type { CopyKey } from "@/lib/copy";

export const Route = createFileRoute("/contact")({ component: Contact });

const SUBJECTS: CopyKey[] = [
  "subjectGeneral",
  "subjectListing",
  "subjectTech",
  "subjectPartner",
  "subjectOther",
];

export function Contact() {
  const { t } = useCopy();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<CopyKey>("subjectGeneral");
  const [body, setBody] = useState("");

  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitPublicMessage({
        data: { kind: "contact", name, email, subject: t(subject), body },
      });
      toast.success(t("contactSent"));
      setBody("");
    } catch {
      toast.error("Could not send. Email kyle@kidease.ca directly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell bare>
      <main className="mx-auto max-w-lg px-5 py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("contact")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("contactTitle")}</h1>
        <p className="mt-6 text-muted">{t("contactIntro")}</p>

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
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {t("submit")}
          </Button>
        </form>

        <div className="mt-10 rounded-xl bg-surface p-5 ring-1 ring-border">
          <p className="text-sm font-semibold">{t("contactDirect")}</p>
          <a
            href="mailto:hello@kidease.ca"
            className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Mail className="size-4" />
            {t("helloEmail")}
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
