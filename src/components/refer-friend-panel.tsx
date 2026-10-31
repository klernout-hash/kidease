import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shareText } from "@/lib/native";
import { growthAttribution, growthLoopsEnabled } from "@/lib/growth-loops";
import { capturePostHogEvent } from "@/lib/posthog";
import { referralPath } from "@/lib/referrals";
import { loadGrowthSummary } from "@/lib/server/growth-loops";
import { useCopy } from "@/lib/use-copy";

type Summary = { code: string; opens: number; joins: number };

function withCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

/** Signed-in share link. Counts opens and new accounts. */
export function ReferFriendPanel() {
  const { t, locale } = useCopy();
  const [info, setInfo] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [thankYous, setThankYous] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(false);
    void fetch("/api/referrals")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((body: Summary) => {
        if (body && typeof body.code === "string") setInfo({ code: body.code, opens: Number(body.opens) || 0, joins: Number(body.joins) || 0 });
        else setError(true);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
    void loadGrowthSummary()
      .then((summary) => setThankYous(summary.enabled ? summary.thankYous : null))
      .catch(() => setThankYous(null));
  }, [load]);

  const path = info ? referralPath(info.code, locale) : "";
  const url = path ? `${typeof window === "undefined" ? "https://www.kidease.ca" : window.location.origin}${path}` : "";

  function noteShare() {
    const hit = growthAttribution({ enabled: growthLoopsEnabled(), event: "referral_opened", code: info?.code, locale });
    if (hit) capturePostHogEvent(hit.event, hit.properties);
  }

  async function onShare() {
    if (!url) return;
    const result = await shareText(t("referFriend"), t("referFriendLead"), url);
    if (result === "shared") noteShare();
    if (result === "shared" || result === "cancelled") return;
    try {
      await navigator.clipboard.writeText(url);
      noteShare();
      toast.success(t("referFriendCopied"));
    } catch {
      toast.error(t("referFriendCopyFailed"));
    }
  }

  return (
    <section className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="refer-friend">
      <h2 className="font-display text-xl tracking-[-0.02em]">{t("referFriend")}</h2>
      <p className="mt-2 text-sm text-muted">{t("referFriendLead")}</p>
      {error ? (
        <div className="mt-4">
          <p className="text-sm text-danger" role="alert">{t("referFriendLoadError")}</p>
          <Button type="button" className="mt-3" onClick={load}>{t("referFriendTryAgain")}</Button>
        </div>
      ) : info ? (
        <div className="mt-4">
          <p className="break-all text-sm">{url}</p>
          <Button type="button" className="mt-4 w-full" onClick={() => void onShare()}>{t("referFriendShare")}</Button>
          {info.opens === 0 && info.joins === 0 ? <p className="mt-4 text-sm">{t("referFriendEmpty")}</p> : null}
          {info.opens > 0 ? <p className="mt-4 text-sm">{withCount(t("referFriendOpens"), info.opens)}</p> : null}
          {info.joins > 0 ? <p className="mt-1 text-sm">{withCount(t("referFriendJoins"), info.joins)}</p> : null}
          {thankYous != null ? (
            <p className="mt-3 text-sm">
              {locale === "fr"
                ? `${thankYous} note${thankYous === 1 ? "" : "s"} de remerciement. Ce n’est pas un paiement.`
                : `${thankYous} thank-you note${thankYous === 1 ? "" : "s"}. This is not a payment.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
