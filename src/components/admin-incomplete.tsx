import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import type { IncompleteMissingField } from "@/lib/listing-incomplete";
import type { AdminCentreRow, Decision } from "@/lib/server/admin-centres";
import type { AdminPackRow } from "@/lib/server/contracts";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { CentrePackChips } from "@/components/admin-contracts";

const MISSING_COPY: Record<IncompleteMissingField, CopyKey> = {
  license_photo: "adminIncompleteNeedLicensePhoto",
  screening: "adminIncompleteNeedScreening",
  photo: "adminIncompleteNeedPhoto",
  fees: "adminIncompleteNeedFees",
  ages: "adminIncompleteNeedAges",
  hours: "adminIncompleteNeedHours",
};

const MISSING_HREF: Record<IncompleteMissingField, { tab: "queue" | "verify" | "screening" }> = {
  license_photo: { tab: "verify" },
  screening: { tab: "screening" },
  photo: { tab: "verify" },
  fees: { tab: "queue" },
  ages: { tab: "queue" },
  hours: { tab: "queue" },
};

function formatWhen(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Winnipeg",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AdminIncompleteQueue({
  rows,
  contracts,
  busy,
  onDecide,
  error,
}: {
  rows: AdminCentreRow[];
  contracts: { daycareId: string; packs?: AdminPackRow[] }[];
  busy: string | null;
  onDecide: (id: string, d: Decision) => void;
  error?: string | null;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const loadFailed = Boolean(error);

  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-border">
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{t("adminIncompleteEyebrow")}</p>
          <h2 className="mt-1 font-display text-2xl">{t("adminIncompleteTitle")}</h2>
        </div>
        <p className="text-sm text-muted">
          {loadFailed
            ? error
            : rows.length === 0
              ? t("adminIncompleteCaughtUp")
              : t("adminIncompleteCount").replace("{n}", String(rows.length))}
        </p>
      </div>
      <p className="border-t border-border px-5 py-3 text-sm text-muted">{t("adminIncompleteLead")}</p>
      {loadFailed ? (
        <p className="border-t border-border px-5 py-8 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="border-t border-border px-5 py-8 text-sm text-muted">{t("adminIncompleteEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((c) => {
            const submitted = formatWhen(c.submittedAt, loc);
            const updated = formatWhen(c.updatedAt, loc);
            const packs = contracts.find((row) => row.daycareId === c.daycareId)?.packs;
            return (
              <li key={c.daycareId} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.name}</p>
                      <ListingStatusBadge claimStatus={c.claimStatus} live={c.live} claimedAt={c.claimedAt} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {[c.city, c.province].filter(Boolean).join(", ")}
                      {c.address ? ` · ${c.address}` : ""}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {c.providerName || "—"} · {c.providerEmail || c.contactEmail || "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {submitted ? `${t("adminIncompleteSubmitted")} ${submitted}` : null}
                      {submitted && updated ? " · " : null}
                      {updated ? `${t("adminIncompleteUpdated")} ${updated}` : null}
                    </p>
                    {packs?.length ? <CentrePackChips packs={packs} /> : null}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.missing.map((item) => (
                        <Link
                          key={item}
                          to="/admin"
                          search={MISSING_HREF[item]}
                          className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-medium text-warn no-underline hover:underline"
                        >
                          {t(MISSING_COPY[item])}
                        </Link>
                      ))}
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                        {c.live ? t("adminIncompleteClaimLive") : t("adminIncompleteClaimWaiting")}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/daycare/$slug" params={{ slug: c.slug }}>
                        {t("viewListing")}
                      </Link>
                    </Button>
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/admin" search={{ tab: "queue" }}>
                        {t("adminIncompleteOpenQueue")}
                      </Link>
                    </Button>
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/admin" search={{ tab: "verify" }}>
                        {t("adminIncompleteOpenVerify")}
                      </Link>
                    </Button>
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/admin" search={{ tab: "screening" }}>
                        {t("adminIncompleteOpenScreening")}
                      </Link>
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => onDecide(c.daycareId, "waiting")}>
                      {t("adminIncompleteKeepWaiting")}
                    </Button>
                    <Button size="sm" disabled={busy !== null} onClick={() => onDecide(c.daycareId, "approve")}>
                      {t("adminIncompleteApprove")}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
