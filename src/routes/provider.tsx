import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PriorityPill } from "@/components/priority-pill";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createListing, getProvider, setRole, updateRequestStatus } from "@/lib/server/family";
import { updateListing } from "@/lib/server/claims";
import { promoteListing } from "@/lib/server/promos";
import { PROMO_PLANS, isPriorityActive, type PromoPlanId } from "@/lib/promos";
import { useCopy } from "@/lib/use-copy";
import { formatAgeLabel, formatStart, emailBodyNewRequest, emailSubjectNewRequest, scheduleLabel } from "@/lib/templates";
import { cn, money, formatAgeRange } from "@/lib/utils";
import type { BookingStatus, Daycare, SpotRequest } from "@/lib/types";

type DaycareDesk = "requests" | "listings" | "licence" | "promote";

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

function PromotePanel({ daycare, onSaved }: { daycare: Daycare; onSaved: () => void }) {
  const { t, locale } = useCopy();
  const [plan, setPlan] = useState<PromoPlanId>("month");
  const [busy, setBusy] = useState(false);
  const active = isPriorityActive(daycare.priorityUntil);
  const until = daycare.priorityUntil
    ? new Date(daycare.priorityUntil).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="mt-4 rounded-xl bg-surface p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-xl">
            <Megaphone className="size-5 text-primary" />
            {t("promoteTitle")}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-muted">{t("promoteLead")}</p>
        </div>
        <PriorityPill />
      </div>
      {active ? (
        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {t("promoteActive")} {until}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {PROMO_PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlan(p.id)}
            className={cn("rounded-xl px-3 py-3 text-left ring-1", plan === p.id ? "bg-bg ring-2 ring-primary" : "bg-bg ring-border")}
          >
            <p className="text-sm font-medium">{p.id === "week" ? t("promoteWeek") : p.id === "month" ? t("promoteMonth") : t("promoteQuarter")}</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{money(p.amount, locale)}</p>
          </button>
        ))}
      </div>
      <Button
        className="mt-3"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void promoteListing({ data: { daycareId: daycare.id, plan } })
            .then(() => {
              toast.success(t("promotePay"));
              onSaved();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Error"))
            .finally(() => setBusy(false));
        }}
      >
        {active ? t("promoteExtend") : t("promotePay")} · {money(PROMO_PLANS.find((p) => p.id === plan)?.amount ?? 0, locale)}
      </Button>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function CapacityForm({
  daycare,
  onSaved,
  mode,
}: {
  daycare: Daycare;
  onSaved: () => void;
  mode: "listing" | "licence";
}) {
  const { t, locale } = useCopy();
  const [state, setState] = useState({
    name: daycare.name,
    address: daycare.address,
    city: daycare.city,
    province: daycare.province,
    postalCode: daycare.postalCode,
    phone: daycare.phone ?? "",
    email: daycare.contactEmail ?? "",
    spotsInfant: daycare.spotsInfant,
    spotsToddler: daycare.spotsToddler,
    spotsPreschool: daycare.spotsPreschool,
    infantMonthly: daycare.infantMonthly ?? 0,
    toddlerMonthly: daycare.toddlerMonthly ?? 0,
    preschoolMonthly: daycare.preschoolMonthly ?? 0,
    ageMinMonths: daycare.agesKnown ? daycare.ageMinMonths : 12,
    ageMaxMonths: daycare.agesKnown ? daycare.ageMaxMonths : 60,
    storefront: "",
    interiors: [] as string[],
    licensePhoto: "",
  });
  const preview = state.storefront || daycare.photos[0];

  function readImage(file: File | undefined, into: "storefront" | "interiors" | "license") {
    if (!file) return;
    if (file.size > 1_800_000) {
      toast.error(t("photoTooBig"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      if (into === "storefront") setState((s) => ({ ...s, storefront: value }));
      else if (into === "license") setState((s) => ({ ...s, licensePhoto: value }));
      else setState((s) => ({ ...s, interiors: [...s.interiors, value].slice(0, 5) }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void updateListing({
          data: {
            daycareId: daycare.id,
            name: state.name,
            address: state.address,
            city: state.city,
            province: state.province,
            postalCode: state.postalCode,
            phone: state.phone,
            email: state.email,
            storefront: state.storefront || undefined,
            interiors: state.interiors,
            licensePhoto: state.licensePhoto || undefined,
            spotsInfant: state.spotsInfant,
            spotsToddler: state.spotsToddler,
            spotsPreschool: state.spotsPreschool,
            infantMonthly: state.infantMonthly,
            toddlerMonthly: state.toddlerMonthly,
            preschoolMonthly: state.preschoolMonthly,
            ageMinMonths: state.ageMinMonths,
            ageMaxMonths: state.ageMaxMonths,
          },
        })
          .then(onSaved)
          .then(() => toast.success(t("saveChanges")));
      }}
    >
      {mode === "licence" ? (
        <>
          <p className="text-sm text-muted">Upload a clear photo or scan of the current provincial licence. Required for compliance review.</p>
          <label className="block text-sm font-medium">
            Provincial licence photo
            <input type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(e) => readImage(e.target.files?.[0], "license")} />
          </label>
          {state.licensePhoto ? <img src={state.licensePhoto} alt="Licence preview" className="max-h-48 rounded-md object-contain ring-1 ring-border" /> : null}
        </>
      ) : (
        <>
          <h3 className="font-display text-xl">{t("storefrontPhoto")}</h3>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {preview ? (
              <img src={preview} alt="" className="h-36 w-full max-w-xs rounded-xl object-cover ring-1 ring-border sm:h-28 sm:w-40" />
            ) : (
              <div className="grid h-36 w-full max-w-xs place-items-center rounded-xl bg-bg text-sm text-muted ring-1 ring-dashed ring-border sm:h-28 sm:w-40">
                {t("storefrontPhoto")}
              </div>
            )}
            <label className="flex min-h-28 flex-1 cursor-pointer flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-border bg-bg px-4 py-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-primary">
                <Camera className="size-4" />
                {t("storefrontCta")}
              </span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => readImage(e.target.files?.[0], "storefront")} />
            </label>
          </div>
          <h3 className="font-display text-xl">{t("businessDetails")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("centreName")} value={state.name} onChange={(v) => setState({ ...state, name: v })} />
            <Field label={t("addressLabel")} value={state.address} onChange={(v) => setState({ ...state, address: v })} />
            <Field label={t("cityLabel")} value={state.city} onChange={(v) => setState({ ...state, city: v })} />
            <Field label={t("provinceLabel")} value={state.province} onChange={(v) => setState({ ...state, province: v })} />
            <Field label={t("postalLabel")} value={state.postalCode} onChange={(v) => setState({ ...state, postalCode: v })} />
            <Field label={t("phoneLabel")} value={state.phone} onChange={(v) => setState({ ...state, phone: v })} />
            <Field label={t("contactEmail")} value={state.email} onChange={(v) => setState({ ...state, email: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Num label={t("spotsInfant")} value={state.spotsInfant} onChange={(n) => setState({ ...state, spotsInfant: n })} />
            <Num label={t("spotsToddler")} value={state.spotsToddler} onChange={(n) => setState({ ...state, spotsToddler: n })} />
            <Num label={t("spotsPreschool")} value={state.spotsPreschool} onChange={(n) => setState({ ...state, spotsPreschool: n })} />
            <Num label={t("infantFee")} value={state.infantMonthly} onChange={(n) => setState({ ...state, infantMonthly: n })} />
            <Num label={t("toddlerFee")} value={state.toddlerMonthly} onChange={(n) => setState({ ...state, toddlerMonthly: n })} />
            <Num label={t("preschoolFee")} value={state.preschoolMonthly} onChange={(n) => setState({ ...state, preschoolMonthly: n })} />
          </div>
          <p className="text-sm tabular-nums text-muted">
            {t("agesAccepted")}: {formatAgeRange(state.ageMinMonths, state.ageMaxMonths)}
          </p>
        </>
      )}
      <Button type="submit" variant="secondary">
        {t("saveChanges")}
      </Button>
    </form>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <input type="number" className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
