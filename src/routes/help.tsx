import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { submitPublicMessage } from "@/lib/server/notify";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Centre · KidEase" },
      { name: "description", content: "Parents and providers — we read every note." },
    ],
  }),
  component: Help,
});

function Help() {
  const { t } = useCopy();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");

  const [busy, setBusy] = useState(false);
  const { token, onToken } = useTurnstileToken();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitPublicMessage({
        data: { kind: "support", name, email, body, turnstileToken: token },
      });
      toast.success(t("supportSent"));
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
        <p className="ke-kicker">{t("helpKicker")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("helpTitle")}</h1>
        <p className="mt-6 text-muted">{t("supportLead")}</p>

        <div className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border">
          <p className="text-sm font-semibold">{t("contactDirect")}</p>
          <a
            href={`mailto:${SUPPORT_INBOX_EMAIL}`}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Mail className="size-4" />
            {SUPPORT_INBOX_EMAIL}
          </a>
        </div>

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
          <TurnstileField onToken={onToken} />
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {t("send")}
          </Button>
        </form>
      </main>
      <SiteFooter />
    </Shell>
  );
}
