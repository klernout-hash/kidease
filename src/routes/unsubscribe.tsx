import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { applyPublicUnsubscribe } from "@/lib/server/casl-consent";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => {
    const token = typeof s.token === "string" ? s.token : "";
    const channel = s.channel === "sms" || s.channel === "email" ? s.channel : undefined;
    return { token: token || undefined, channel };
  },
  head: () => ({
    meta: [
      { title: "Unsubscribe · KidEase" },
      { name: "description", content: "Stop KidEase email or SMS. CASL unsubscribe — no login required." },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { t } = useCopy();
  const search = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms">(search.channel === "sms" ? "sms" : "email");
  const [address, setAddress] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await applyPublicUnsubscribe({
        data: search.token ? { token: search.token } : { channel, address },
      });
      if (!res.ok) {
        toast.error("error" in res && res.error ? res.error : t("unsubscribe"));
        return;
      }
      setDone(true);
      toast.success(t("unsubscribeDone"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("unsubscribe"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t("caslLegend")}</p>
        <h1 className="mt-2 font-display text-3xl tracking-[-0.03em]">{t("unsubscribe")}</h1>
        <p className="mt-3 text-muted">{t("unsubscribeLead")}</p>
        {done ? (
          <p className="mt-8 rounded-xl bg-surface p-5 text-sm ring-1 ring-border">{t("unsubscribeDone")}</p>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            {search.token ? (
              <p className="text-sm text-muted">{t("unsubscribeTokenLead")}</p>
            ) : (
              <>
                <label className="block text-sm">
                  {t("unsubscribeChannel")}
                  <select
                    className="ke-input mt-1"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value === "sms" ? "sms" : "email")}
                  >
                    <option value="email">{t("email")}</option>
                    <option value="sms">{t("sms")}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  {channel === "sms" ? t("caslPhoneLabel") : t("email")}
                  <input
                    className="ke-input mt-1"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    autoComplete={channel === "sms" ? "tel" : "email"}
                    inputMode={channel === "sms" ? "tel" : "email"}
                    required
                  />
                </label>
              </>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("loading") : t("unsubscribe")}
            </Button>
          </form>
        )}
      </main>
    </Shell>
  );
}
