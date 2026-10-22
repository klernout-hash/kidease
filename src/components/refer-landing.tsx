import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { normalizeReferralCode, writeReferralCode } from "@/lib/referrals";
import { useCopy } from "@/lib/use-copy";

/** Public page for a friend's link. Stores the code on this phone. No reward. */
export function ReferLanding({ code }: { code: string }) {
  const { t, locale } = useCopy();
  const valid = normalizeReferralCode(code);

  useEffect(() => {
    if (!valid) return;
    writeReferralCode(valid);
    const seen = `kidease-refer-opened:${valid}`;
    try {
      if (window.localStorage.getItem(seen)) return;
    } catch {
      return;
    }
    void fetch("/api/referrals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "open", code: valid }),
    })
      .then((res) => {
        if (res.ok || res.status === 404) window.localStorage.setItem(seen, "1");
      })
      .catch(() => undefined);
  }, [valid]);

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-8 pb-[max(2rem,env(safe-area-inset-bottom))]" data-ke="refer-landing">
        <p className="ke-kicker">{t("referLandingKicker")}</p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,5vw,2.5rem)] tracking-[-0.03em]">{t("referLandingTitle")}</h1>
        <p className="mt-4 text-muted">{valid ? t("referLandingLead") : t("referLandingBad")}</p>
        <Button className="mt-6 w-full" asChild>
          <Link to={localePath("/search", locale)}>{t("referLandingNext")}</Link>
        </Button>
      </main>
    </Shell>
  );
}
