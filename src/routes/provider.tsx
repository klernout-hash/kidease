import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PriorityPill } from "@/components/priority-pill";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createListing, getProvider, setRole, updateRequestStatus } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";
import { formatAgeLabel, formatStart, emailBodyNewRequest, emailSubjectNewRequest, scheduleLabel } from "@/lib/templates";
import type { BookingStatus, Daycare, SpotRequest } from "@/lib/types";
import { ProviderContractsPanel } from "@/components/provider-contracts";
import { CapacityForm, Field, PromotePanel } from "@/components/provider-listing-forms";

type DaycareDesk = "requests" | "listings" | "licence" | "contract" | "promote";

export const Route = createFileRoute("/provider")({ component: ProviderPage });

function ProviderPage() {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const [desk, setDesk] = useState<DaycareDesk>("requests");
  const [listings, setListings] = useState<Daycare[]>([]);
  const [stats, setStats] = useState<Array<{ daycareId: string; views: number; inquiries: number; requests: number }>>([]);
  const [requests, setRequests] = useState<SpotRequest[]>([]);
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
    const res = await getProvider();
    setListings(res.listings);
    setStats(res.stats);
    setRequests(res.requests);
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
  if (!user) return <RedirectToSignIn />;

  return (
    <DeskShell desk="daycare" active={desk} onSelect={(id) => setDesk(id as DaycareDesk)}>
      {desk === "requests" ? (
        <section>
          <h2 className="font-display text-2xl">{t("incomingRequests")}</h2>
          <p className="mt-1 text-sm text-muted">Parents who asked this centre for a spot.</p>
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
            {requests.length === 0 ? (
              <li className="p-8 text-center text-muted">{t("noRequests")}</li>
            ) : (
              requests.map((r) => {
                const copy = {
                  parentName: r.parentName ?? t("parentLabel"),
                  childName: r.childName ?? t("child"),
                  age: r.birthdate ? formatAgeLabel(r.birthdate, locale) : t(r.ageGroup),
                  dob: r.birthdate,
                  daycareName: r.daycareName,
                  start: formatStart(r.startDate ?? r.startMonth, locale),
                  schedule: scheduleLabel(r.schedule, r.days, locale),
                  note: r.parentNote,
                };
                return (
                  <li key={r.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{emailSubjectNewRequest(copy, locale)}</p>
                          <StatusBadge status={r.status} />
                        </div>
                      </div>
                      {r.conversationId ? (
                        <Button size="sm" asChild>
                          <Link to="/inbox/$id" params={{ id: r.conversationId }}>
                            {t("viewRespond")}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-bg px-3 py-3 font-sans text-sm leading-relaxed text-fg">
                      {emailBodyNewRequest(copy, locale)}
                    </pre>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["under_review", "accepted", "waitlist", "declined"] as BookingStatus[]).map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant={r.status === st ? "primary" : "secondary"}
                          onClick={() => {
                            void updateRequestStatus({ data: { bookingId: r.id, status: st } })
                              .then(() => load())
                              .then(() => toast.success(t("requestSent")));
                          }}
                        >
                          {st === "under_review" ? t("markReview") : st === "accepted" ? t("offerSpot") : st === "waitlist" ? t("waitlistChild") : t("declineRequest")}
                        </Button>
                      ))}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
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
                    <Link to="/daycare/$slug" params={{ slug: d.slug }} className="font-display text-2xl hover:underline">
                      {locale === "fr" ? d.nameFr : d.name}
                    </Link>
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
          <section className="rounded-xl bg-surface p-5 ring-1 ring-border">
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
          <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">
            Claim or list a centre first, then upload the provincial licence photo here.
          </p>
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
          <p className="rounded-xl bg-surface px-5 py-8 text-center text-muted ring-1 ring-border">List a centre before buying priority placement.</p>
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
  );
}
