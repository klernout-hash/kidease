import { Link } from "@tanstack/react-router";
import { RoleUpgradeCard, UpgradeToProLink } from "@/components/role-upgrade-card";
import { listingCompleteness, type CompletenessField } from "@/lib/listing-readiness";
import { isOpenLeadStatus, type LeadRequest } from "@/lib/lead-requests";
import type { Daycare, TourRequest } from "@/lib/types";

const MISSING_LABEL: Record<CompletenessField, string> = {
  fees: "Fees",
  ages: "Ages",
  hours: "Hours",
  license: "Licence",
  photo: "Photos",
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
  const waitingLeads = leads.filter((lead) => isOpenLeadStatus(lead.status));
  const waitingTours = tours.filter((tour) => tour.status === "pending");
  const waiting = waitingLeads.length + waitingTours.length;
  const primary = listings[0];
  const missing = primary ? listingCompleteness(primary).missing : [];

  return (
    <div className="mb-6 space-y-3" data-ke="daycare-desk">
      <RoleUpgradeCard role="provider" paid={paid} planLabel={paid ? planName : null} renewsOn={renewsOn} />

      <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
        <h2 className="font-display text-xl">Enquiries & tours</h2>
        {waiting === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing is waiting on a reply.</p>
        ) : (
          <p className="mt-1 text-sm text-fg">
            {waiting} waiting on a reply
            {waitingLeads.length ? ` · ${waitingLeads.length} enquiries` : ""}
            {waitingTours.length ? ` · ${waitingTours.length} tours` : ""}
          </p>
        )}
        <Link to="/provider" search={{ desk: "requests" }} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          Open enquiries
        </Link>
      </section>

      <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
        <h2 className="font-display text-xl">Listing</h2>
        {!primary ? (
          <p className="mt-1 text-sm text-muted">Add your centre so families can find you.</p>
        ) : missing.length === 0 ? (
          <p className="mt-1 text-sm text-muted">{primary.name} has photos, fees, hours, ages, and a licence on file.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Still missing on {primary.name}:</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-fg">
              {missing.map((field) => (
                <li key={field}>{MISSING_LABEL[field]}</li>
              ))}
            </ul>
          </>
        )}
        <Link to="/provider" search={{ desk: "listings" }} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {primary ? "Edit your listing" : "My listing"}
        </Link>
        {paid ? null : (
          <p className="mt-2 text-sm text-muted">
            Featured city and a listing boost are Pro benefits. <UpgradeToProLink />
          </p>
        )}
      </section>

      <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border" data-ke="daycare-plan">
        <h2 className="font-display text-xl">Current plan</h2>
        <p className="mt-1 text-sm text-fg">{paid ? planName : "Free"}</p>
        <p className="text-sm text-muted">Listing, messages, and vacancy stay free. Paid plans are optional and shown in CA$.</p>
      </section>

    </div>
  );
}
