import { topRatedEnabled } from "@/lib/features";
import { topRatedPage } from "@/lib/qa-fixes";
import { useCopy } from "@/lib/use-copy";

/** Status page. Rules only. No invented progress numbers. */
export function TopRatedDesk({ on = false }: { on?: boolean }) {
  const { t } = useCopy();
  const page = topRatedPage(on || topRatedEnabled());
  if (page === "soon") {
    return (
      <section className="mx-auto max-w-2xl px-4 py-6" data-ke="top-rated-desk">
        <h1 className="font-display text-2xl">{t("topRatedTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("comingSoon")}</p>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-2xl px-4 py-6" data-ke="top-rated-desk">
      <h1 className="font-display text-2xl">{t("topRatedTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("topRatedLead")}</p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">{t("topRatedRuleRating")}</li>
        <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">{t("topRatedRuleReviews")}</li>
        <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">{t("topRatedRuleDocuments")}</li>
        <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">{t("topRatedRuleReplies")}</li>
        <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">{t("topRatedRuleSpots")}</li>
        <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">{t("topRatedRuleSafety")}</li>
      </ul>
    </section>
  );
}
