import { Link } from "@tanstack/react-router";
import { RoleUpgradeCard } from "@/components/role-upgrade-card";
import { listingCompleteness, type CompletenessField } from "@/lib/listing-readiness";
import { isOpenLeadStatus, type LeadRequest } from "@/lib/lead-requests";
import { daycareCapPrompt, daycareHomeCardEligible, showHomeUpgradeCard } from "@/lib/upgrade-prompt";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { Daycare, TourRequest } from "@/lib/types";

const MISSING_KEY: Record<CompletenessField, CopyKey> = {
  fees: "deskMissFees",
  ages: "ages",
  hours: "hours",
  license: "license",
  photo: "deskMissPhotos",
};

/** Daycare landing: replies waiting, listing gaps, and the current plan. */
export function DaycareDeskHome({
  listings,
  leads,
  tours,
  planName,
  paid,
  renewsOn,
  inquiryUsed = 0,
  inquiryCap = null,
  dismissed = false,
  settled = false,
  onDismiss,
}: {
  listings: Daycare[];
  leads: LeadRequest[];
  tours: TourRequest[];
  planName: string;
  paid: boolean;
  renewsOn?: string | null;
  inquiryUsed?: number;
  inquiryCap?: number | null;
  dismissed?: boolean;
  settled?: boolean;
  onDismiss?: () => void;
}) {
  const { t } = useCopy();
  const waitingLeads = leads.filter((lead) => isOpenLeadStatus(lead.status));
  const waitingTours = tours.filter((tour) => tour.status === "pending");
  const waiting = waitingLeads.length + waitingTours.length;
  const primary = listings[0];
  const completeness = primary ? listingCompleteness(primary) : null;
  const missing = completeness?.missing ?? [];
  const card = showHomeUpgradeCard({
    paid,
    eligible: daycareHomeCardEligible({
      claimed: Boolean(primary?.claimed || primary?.claimedAt),
      listingReady: Boolean(completeness?.ready),
    }),
    dismissed,
  });
  const cap = daycareCapPrompt(inquiryUsed, inquiryCap);
  const capCopy =
    cap === "at"
      ? t("daycareCapHit")
      : cap === "near"
        ? t("daycareCapNear").replace("{used}", String(inquiryUsed)).replace("{cap}", String(inquiryCap ?? ""))
        : null;

  return (
    <div className="mb-6 space-y-3" data-ke="daycare-desk" data-settled={settled ? "1" : "0"}>
      {card ? (
        <RoleUpgradeCard
          role="provider"
          paid={card === "plan"}
          planLabel={card === "plan" ? planName : null}
          renewsOn={renewsOn}
          onDismiss={card === "upgrade" ? onDismiss : undefined}
        />
      ) : null}
      {capCopy ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-fg ring-1 ring-border" data-ke="daycare-cap-prompt">
          {capCopy}{" "}
          <Link to="/provider/subscription" className="font-semibold text-primary">
            {t("planViewPlans")}
          </Link>
        </p>
      ) : null}

      <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
        <h2 className="font-display text-xl">{t("deskHomeEnquiries")}</h2>
        {waiting === 0 ? (
          <p className="mt-1 text-sm text-muted">{t("deskHomeNothingWaiting")}</p>
        ) : (
          <p className="mt-1 text-sm text-fg">{t("deskHomeWaiting").replace("{n}", String(waiting))}</p>
        )}
        <Link to="/provider" search={{ desk: "requests" }} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {t("deskHomeOpenEnquiries")}
        </Link>
      </section>

      <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
        <h2 className="font-display text-xl">{t("deskHomeListing")}</h2>
        {!primary ? (
          <p className="mt-1 text-sm text-muted">{t("deskHomeAddCentre")}</p>
        ) : missing.length === 0 ? (
          <p className="mt-1 text-sm text-muted">{t("deskHomeComplete").replace("{name}", primary.name)}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">{t("deskHomeMissing").replace("{name}", primary.name)}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-fg">
              {missing.map((field) => (
                <li key={field}>{t(MISSING_KEY[field])}</li>
              ))}
            </ul>
          </>
        )}
        <Link to="/provider" search={{ desk: "listings" }} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {primary ? t("deskHomeEdit") : t("deskHomeMyListing")}
        </Link>
      </section>

      <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="daycare-plan">
        <h2 className="font-display text-xl">{t("deskHomeCurrentPlan")}</h2>
        <p className="mt-1 text-sm text-fg">{paid ? planName : t("deskHomeFree")}</p>
        <p className="text-sm text-muted">{t("deskHomeFreeNote")}</p>
      </section>

    </div>
  );
}
