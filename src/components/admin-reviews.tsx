import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  decideListingReview,
  grantListingReviewer,
  listAdminReviews,
  type AdminReviewRow,
  type ReviewDecision,
} from "@/lib/server/reviews";
import { normalizeReviewStatus } from "@/lib/review-gate";
import { useCopy } from "@/lib/use-copy";

export function AdminReviewsPanel() {
  const { t, locale } = useCopy();
  const [rows, setRows] = useState<AdminReviewRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [grantUserId, setGrantUserId] = useState("");
  const [grantDaycareId, setGrantDaycareId] = useState("");

  async function load() {
    setRows(await listAdminReviews().catch(() => []));
  }

  useEffect(() => {
    void load();
  }, []);

  const pending = rows.filter((r) => normalizeReviewStatus(r.status) === "pending");
  const decided = rows.filter((r) => normalizeReviewStatus(r.status) !== "pending");

  async function decide(reviewId: string, decision: ReviewDecision) {
    setBusy(`${reviewId}:${decision}`);
    try {
      await decideListingReview({ data: { reviewId, decision, note } });
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that decision");
    } finally {
      setBusy(null);
    }
  }

  async function grant() {
    setBusy("grant");
    try {
      await grantListingReviewer({ data: { userId: grantUserId, daycareId: grantDaycareId, note } });
      toast.success(t("reviewerGranted"));
      setGrantUserId("");
      setGrantDaycareId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("grantReviewer"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{t("adminReviews")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("adminReviewsLead")}</p>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("reviewDecisionNote")}
        className="h-11 w-full rounded-full bg-surface px-4 text-sm ring-1 ring-border"
      />
      <form
        className="grid gap-2 rounded-xl bg-surface p-4 ring-1 ring-border md:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void grant();
        }}
      >
        <input
          value={grantUserId}
          onChange={(e) => setGrantUserId(e.target.value)}
          placeholder={t("grantReviewerUser")}
          className="h-11 rounded-full bg-bg px-4 text-sm ring-1 ring-border"
        />
        <input
          value={grantDaycareId}
          onChange={(e) => setGrantDaycareId(e.target.value)}
          placeholder={t("grantReviewerCentre")}
          className="h-11 rounded-full bg-bg px-4 text-sm ring-1 ring-border"
        />
        <Button type="submit" size="sm" disabled={busy === "grant"}>
          {t("grantReviewer")}
        </Button>
        <p className="md:col-span-3 text-xs text-muted">{t("grantReviewerLead")}</p>
      </form>
      <div className="overflow-hidden rounded-2xl bg-[#1a3790] text-primary-fg shadow-card">
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fg/70">Waiting</p>
          <h3 className="mt-1 font-display text-2xl">{pending.length} to review</h3>
        </div>
        {pending.length === 0 ? (
          <p className="border-t border-white/10 px-5 py-8 text-sm text-primary-fg/70">{t("noPendingReviews")}</p>
        ) : (
          <ul className="divide-y divide-white/10 border-t border-white/10">
            {pending.map((r) => (
              <ReviewRow key={r.id} r={r} locale={locale} invert busy={busy} onDecide={decide} />
            ))}
          </ul>
        )}
      </div>
      {decided.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {decided.map((r) => (
            <ReviewRow key={r.id} r={r} locale={locale} busy={busy} onDecide={decide} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ReviewRow({
  r,
  locale,
  invert,
  busy,
  onDecide,
}: {
  r: AdminReviewRow;
  locale: string;
  invert?: boolean;
  busy: string | null;
  onDecide: (id: string, decision: ReviewDecision) => Promise<void>;
}) {
  const { t } = useCopy();
  const muted = invert ? "text-primary-fg/75" : "text-muted";
  const status = normalizeReviewStatus(r.status);
  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {r.centreName} · {r.rating}/5 · {r.author}
          </p>
          <p className={`mt-1 text-sm ${muted}`}>{locale === "fr" && r.bodyFr ? r.bodyFr : r.body}</p>
          <p className={`mt-2 text-xs ${muted}`}>
            {status}
            {r.gateReason ? ` · ${r.gateReason}` : ""}
            {r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleString()}` : ""}
            {r.reviewNote ? ` · ${r.reviewNote}` : ""}
          </p>
          <Link to="/daycare/$slug" params={{ slug: r.slug }} className={`mt-2 inline-block text-sm underline-offset-4 hover:underline ${invert ? "text-primary-fg" : "text-primary"}`}>
            View listing
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {status !== "published" ? (
            <Button size="sm" disabled={busy === `${r.id}:publish`} onClick={() => void onDecide(r.id, "publish")}>
              {t("publishReview")}
            </Button>
          ) : null}
          {status !== "hidden" ? (
            <Button size="sm" variant="secondary" disabled={busy === `${r.id}:hide`} onClick={() => void onDecide(r.id, "hide")}>
              {t("hideReview")}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
