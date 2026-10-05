import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { applyPublicUnsubscribe } from "@/lib/server/casl-consent-api";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export function unsubscribeValidateSearch(s: Record<string, unknown>) {
  const token = typeof s.token === "string" ? s.token : "";
  const channel = s.channel === "sms" || s.channel === "email" ? s.channel : undefined;
  return { token: token || undefined, channel };
}

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: unsubscribeValidateSearch,
  head: () =>
    pageSeoHead({
      title: "Unsubscribe · KidEase",
      description: "Stop KidEase email or SMS. CASL unsubscribe: no login required.",
      path: "/unsubscribe",
    }),
  component: UnsubscribeRoute,
});

function UnsubscribeRoute() {
  return <UnsubscribePage search={Route.useSearch()} />;
}

export function UnsubscribePage({ search }: { search: ReturnType<typeof unsubscribeValidateSearch> }) {
  const { t } = useCopy();
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
          <div className="mt-8 space-y-4 rounded-xl bg-surface p-5 text-sm ring-1 ring-border">
            <p>{t("unsubscribeDone")}</p>
            <p>
              <Link
                to="/account"
                search={{ tab: "profile", section: "alerts", desk: "parent" }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("accountAlerts")}
              </Link>
            </p>
            <p>
              <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
                {t("navHome")}
              </Link>
            </p>
          </div>
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
