import { Link } from "@tanstack/react-router";
import { RoleUpgradeCard, UpgradeToProLink } from "@/components/role-upgrade-card";
import { listingCompleteness, type CompletenessField } from "@/lib/listing-readiness";
import { isOpenLeadStatus, type LeadRequest } from "@/lib/lead-requests";
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
}: {
  listings: Daycare[];
  leads: LeadRequest[];
  tours: TourRequest[];
  planName: string;
  paid: boolean;
  renewsOn?: string | null;
}) {
  const { t } = useCopy();
  const waitingLeads = leads.filter((lead) => isOpenLeadStatus(lead.status));
  const waitingTours = tours.filter((tour) => tour.status === "pending");
  const waiting = waitingLeads.length + waitingTours.length;
  const primary = listings[0];
  const missing = primary ? listingCompleteness(primary).missing : [];

  return (
    <div className="mb-6 space-y-3" data-ke="daycare-desk">
      <RoleUpgradeCard role="provider" paid={paid} planLabel={paid ? planName : null} renewsOn={renewsOn} />

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
        {paid ? null : (
          <p className="mt-2 text-sm text-muted">
            {t("deskHomeProNote")} <UpgradeToProLink />
          </p>
        )}
      </section>

      <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="daycare-plan">
        <h2 className="font-display text-xl">{t("deskHomeCurrentPlan")}</h2>
        <p className="mt-1 text-sm text-fg">{paid ? planName : t("deskHomeFree")}</p>
        <p className="text-sm text-muted">{t("deskHomeFreeNote")}</p>
      </section>

    </div>
  );
}
