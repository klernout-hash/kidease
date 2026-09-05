import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PriorityPill } from "@/components/priority-pill";
import { TwoFactorGate } from "@/lib/auth/gates";
import { useSettledUser } from "@/lib/auth/use-current-user";
import { createListing, getProvider, setRole } from "@/lib/server/family";
import { decideParentRequest, listDaycareIncoming } from "@/lib/server/enrol-queue";
import { getMyClaims } from "@/lib/server/claims";
import { useCopy } from "@/lib/use-copy";
import { formatAgeLabel, formatStart, scheduleLabel } from "@/lib/templates";
import type { Child, Daycare, SpotRequest } from "@/lib/types";
import { ProviderContractsPanel } from "@/components/provider-contracts";
import { CapacityForm, Field, PromotePanel } from "@/components/provider-listing-forms";
import { ListingStatusBadge } from "@/components/listing-status-badge";

type DaycareDesk = "requests" | "listings" | "licence" | "contract" | "promote";

export const Route = createFileRoute("/provider")({ component: ProviderPage });

function ProviderPage() {
  const { user, isPending } = useSettledUser();
  const { t, locale } = useCopy();
  const [desk, setDesk] = useState<DaycareDesk>("requests");
  const [listings, setListings] = useState<Daycare[]>([]);
  const [stats, setStats] = useState<Array<{ daycareId: string; views: number; inquiries: number; requests: number }>>([]);
  const [requests, setRequests] = useState<SpotRequest[]>([]);
  const [claims, setClaims] = useState<Array<{ id: string; daycare_id: string; status: string; name: string }>>([]);
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "Winnipeg",
    postalCode: "",
    licenseNumber: "",
    infantMonthly: 1200,
    toddlerMonthly: 1100,
    preschoolMonthly: 1000,
  });

  async function load() {
    const [res, incoming, mine] = await Promise.all([getProvider(), listDaycareIncoming(), getMyClaims().catch(() => [])]);
    setListings(res.listings);
    setStats(res.stats);
    setRequests(incoming);
    setClaims(mine);
  }

  useEffect(() => {
    if (!user) return;
    void setRole({ data: "provider" }).then(() => load()).catch(() => undefined);
  }, [user]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <Navigate to="/login" search={{ role: "provider", intent: "in", next: "/provider" }} />;

  const waiting = requests.filter((r) => r.status === "requested" || r.status === "under_review");
  const later = requests.filter((r) => r.status !== "requested" && r.status !== "under_review");

  return (
    <TwoFactorGate next="/provider">
    <DeskShell
      desk="daycare"
      active={desk}
      onSelect={(id) => {
        if (id === "add") {
          setDesk("listings");
          queueMicrotask(() => document.getElementById("list-new")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          return;
        }
        setDesk(id as DaycareDesk);
      }}
    >
      {claims.length ? (
        <div className="mb-6 rounded-xl bg-surface p-4 ring-1 ring-border">
          <p className="text-sm font-medium">Claim status</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {claims.slice(0, 6).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-fg">{c.name}</span>
                <ListingStatusBadge claimStatus={c.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {desk === "requests" ? (
        <section className="space-y-8">
          <div>
            <h2 className="font-display text-2xl">Waiting on you</h2>
            <p className="mt-1 text-sm text-muted">
              Parents who sent a child profile or asked this centre for a spot. Approve, put on waiting, or decline. The parent is notified in their inbox.
            </p>
            {listings.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="Claim or list a centre first."
                  body="Incoming parent requests only show for centres you own."
                  action={t("emptyClaimCentre")}
                  actionTo="/claim"
                />
              </div>
            ) : null}
            <RequestList
              items={waiting}
              empty="No new parent requests right now."
              onDecide={async (id, decision) => {
                await decideParentRequest({ data: { bookingId: id, decision } });
                toast.success(
                  decision === "approve"
                    ? "Approved — parent can pay to confirm."
                    : decision === "decline"
                      ? "Declined — parent was notified."
                      : "Marked waiting — parent was notified.",
                );
                await load();
              }}
              locale={locale}
            />
          </div>
          <div>
            <h2 className="font-display text-2xl">Decided</h2>
            <p className="mt-1 text-sm text-muted">Approved, waitlisted, declined, or already enrolled.</p>
            <RequestList
              items={later}
              empty="Nothing decided yet."
              onDecide={async (id, decision) => {
                await decideParentRequest({ data: { bookingId: id, decision } });
                toast.success("Updated.");
                await load();
              }}
              locale={locale}
            />
          </div>
        </section>
      ) : null}

      {desk === "listings" ? (
        <>
          {listings.map((d) => {
            const st = stats.find((s) => s.daycareId === d.id);
            return (
              <section key={d.id} className="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/daycare/$slug" params={{ slug: d.slug }} className="font-display text-2xl hover:underline">
                        {locale === "fr" ? d.nameFr : d.name}
                      </Link>
                      <ListingStatusBadge claimStatus={d.claimStatus} live={d.live} />
                    </div>
                    <p className="text-sm text-muted">
                      {d.address}, {d.city} · {d.licenseNumber}
                    </p>
                  </div>
                  {d.priority ? <PriorityPill /> : null}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-md bg-bg p-3">
                    <dt className="text-muted">{t("views")}</dt>
                    <dd className="font-display text-2xl tabular-nums">{st?.views ?? 0}</dd>
                  </div>
                  <div className="rounded-md bg-bg p-3">
                    <dt className="text-muted">{t("inquiries")}</dt>
                    <dd className="font-display text-2xl tabular-nums">{st?.inquiries ?? 0}</dd>
                  </div>
                  <div className="rounded-md bg-bg p-3">
                    <dt className="text-muted">{t("conversion")}</dt>
                    <dd className="font-display text-2xl tabular-nums">{st?.requests ?? 0}</dd>
                  </div>
                </dl>
                <CapacityForm daycare={d} onSaved={() => void load()} mode="listing" />
              </section>
            );
          })}
          <section id="list-new" className="scroll-mt-24 rounded-xl bg-surface p-5 ring-1 ring-border">
            <h2 className="font-display text-2xl">{t("listCentre")}</h2>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void createListing({ data: form })
                  .then(() => {
                    toast.success(t("createListing"));
                    return load();
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : "Error"));
              }}
            >
              <Field label={t("centreName")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label={t("licenceNo")} value={form.licenseNumber} onChange={(v) => setForm({ ...form, licenseNumber: v })} />
              <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="Postal code" value={form.postalCode} onChange={(v) => setForm({ ...form, postalCode: v })} />
              <Field label={`${t("infantFee")} CAD`} value={String(form.infantMonthly)} onChange={(v) => setForm({ ...form, infantMonthly: Number(v) || 0 })} />
              <Field label={`${t("toddlerFee")} CAD`} value={String(form.toddlerMonthly)} onChange={(v) => setForm({ ...form, toddlerMonthly: Number(v) || 0 })} />
              <Field label={`${t("preschoolFee")} CAD`} value={String(form.preschoolMonthly)} onChange={(v) => setForm({ ...form, preschoolMonthly: Number(v) || 0 })} />
              <div className="sm:col-span-2">
                <Button type="submit">{t("createListing")}</Button>
              </div>
            </form>
          </section>
        </>
      ) : null}

      {desk === "licence" ? (
        listings.length === 0 ? (
          <EmptyState
            title="Claim or list a centre first."
            body="Then upload the provincial licence photo here."
            action={t("emptyClaimCentre")}
            actionTo="/claim"
          />
        ) : (
          listings.map((d) => (
            <section key={d.id} className="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
              <h2 className="font-display text-2xl">{locale === "fr" ? d.nameFr : d.name}</h2>
              <p className="mt-1 text-sm text-muted">Licence {d.licenseNumber || "number not on file yet"}</p>
              <CapacityForm daycare={d} onSaved={() => void load()} mode="licence" />
            </section>
          ))
        )
      ) : null}

      {desk === "contract" ? <ProviderContractsPanel /> : null}

      {desk === "promote" ? (
        listings.length === 0 ? (
          <EmptyState
            title="List a centre before buying priority placement."
            action={t("emptyListCentre")}
            onAction={() => {
              setDesk("listings");
              queueMicrotask(() => document.getElementById("list-new")?.scrollIntoView({ behavior: "smooth" }));
            }}
          />
        ) : (
          listings.map((d) => (
            <section key={d.id} className="mb-6">
              <h2 className="font-display text-2xl">{locale === "fr" ? d.nameFr : d.name}</h2>
              <PromotePanel daycare={d} onSaved={() => void load()} />
            </section>
          ))
        )
      ) : null}
    </DeskShell>
    </TwoFactorGate>
  );
}

function RequestList({
  items,
  empty,
  onDecide,
  locale,
}: {
  items: SpotRequest[];
  empty: string;
  onDecide: (id: string, decision: "approve" | "decline" | "waiting") => Promise<void>;
  locale: "en" | "fr" | string;
}) {
  const { t } = useCopy();
  if (!items.length) {
    return <p className="mt-4 rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">{empty}</p>;
  }
  return (
    <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
      {items.map((r) => (
        <li key={r.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {r.parentName ?? "Parent"} · {r.childName ?? "Child"}
                </p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {r.daycareName} · {r.birthdate ? formatAgeLabel(r.birthdate, locale as "en") : t(r.ageGroup)} ·{" "}
                {formatStart(r.startDate ?? r.startMonth, locale as "en")} · {scheduleLabel(r.schedule, r.days, locale as "en")}
              </p>
            </div>
            {r.conversationId ? (
              <Button size="sm" variant="secondary" asChild>
                <Link to="/inbox/$id" params={{ id: r.conversationId }}>
                  {t("viewRespond")}
                </Link>
              </Button>
            ) : null}
          </div>
          <ChildPacket child={r.child} allergies={r.allergies} epiPen={r.epiPen} note={r.parentNote} />
          <div className="mt-3 flex flex-wrap gap-2">
            {r.paymentStatus ? (
              <span className="self-center text-xs uppercase tracking-wide text-subtle">{r.paymentStatus}</span>
            ) : null}
            <Button
              size="sm"
              variant={r.status === "accepted" ? "primary" : "secondary"}
              disabled={r.status === "declined" || r.status === "active" || r.status === "cancelled"}
              onClick={() => void onDecide(r.id, "approve").catch((err) => toast.error(err instanceof Error ? err.message : "Could not update"))}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant={r.status === "under_review" || r.status === "requested" ? "primary" : "secondary"}
              disabled={r.status === "declined" || r.status === "active" || r.status === "cancelled"}
              onClick={() => void onDecide(r.id, "waiting").catch((err) => toast.error(err instanceof Error ? err.message : "Could not update"))}
            >
              Waiting
            </Button>
            <Button
              size="sm"
              variant={r.status === "declined" ? "primary" : "secondary"}
              disabled={r.status === "active" || r.status === "cancelled"}
              onClick={() => void onDecide(r.id, "decline").catch((err) => toast.error(err instanceof Error ? err.message : "Could not update"))}
            >
              Decline
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChildPacket({
  child,
  allergies,
  epiPen,
  note,
}: {
  child?: Child | null;
  allergies?: string;
  epiPen?: boolean;
  note?: string | null;
}) {
  const bits = [
    (allergies || child?.allergies) && `Allergies: ${allergies || child?.allergies}`,
    (epiPen || child?.epiPen) && "EpiPen",
    child?.medicalNotes && `Medical: ${child.medicalNotes}`,
    child?.medications && `Meds: ${child.medications}`,
    child?.diet && `Diet: ${child.diet}`,
    child?.foodsAvoid && `Avoid: ${child.foodsAvoid}`,
    child?.napRoutine && `Naps: ${child.napRoutine}`,
    child?.toilet && `Toilet: ${child.toilet}`,
    child?.homeLanguage && `Language: ${child.homeLanguage}`,
    child?.emergencyName && `Emergency: ${child.emergencyName} ${child.emergencyPhone || ""}`.trim(),
    child?.pickupPeople && `Pickup: ${child.pickupPeople}`,
    note && `Note: ${note}`,
  ].filter(Boolean) as string[];
  if (!bits.length) {
    return <p className="mt-3 text-sm text-subtle">Child profile attached — limited details so far.</p>;
  }
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {bits.map((b) => (
        <li key={b} className="rounded-full bg-bg px-2.5 py-1 text-xs text-muted ring-1 ring-border">
          {b}
        </li>
      ))}
    </ul>
  );
}
