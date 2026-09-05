import { createFileRoute } from "@tanstack/react-router";
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
    <Shell>
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="font-display text-3xl">{t("support")}</h1>
        <p className="mt-3 text-muted">{t("supportLead")}</p>
        <form className="mt-8 space-y-3" onSubmit={send}>
          <label className="block text-sm">
            {t("name")}
            <input
              required
              className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="block text-sm">
            {t("email")}
            <input
              required
              type="email"
              className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block text-sm">
            {t("writeMessage")}
            <textarea
              required
              rows={5}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <TurnstileField onToken={onToken} />
          <Button type="submit" className="w-full" disabled={busy}>
            {t("send")}
          </Button>
        </form>
      </main>
      <SiteFooter />
    </Shell>
  );
}
