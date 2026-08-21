import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
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

export const Route = createFileRoute("/provider")({ component: ProviderPage });

function ProviderPage() {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
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
    <Shell>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">{t("providerTitle")}</h1>
            <p className="mt-2 max-w-xl text-muted">{t("providerDiscover")}</p>
            <p className="mt-2 max-w-xl text-sm text-subtle">{t("youStayInControl")}</p>
          </div>
          <Button asChild>
            <Link to="/claim">{t("claimCta")}</Link>
          </Button>
        </div>

        <section className="mt-6">
          <h2 className="font-display text-2xl">{t("incomingRequests")}</h2>
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
                        {r.status === "accepted" && r.paymentStatus !== "paid" ? (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{t("awaitingPay")}</span>
                        ) : null}
                        {r.paymentStatus === "paid" || r.status === "active" ? (
                          <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs text-ok">{t("paymentReceived")}</span>
                        ) : null}
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
                  {r.allergies || r.epiPen ? (
                    <p className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                      {r.epiPen ? `${t("epiPenBadge")} · ` : ""}
                      {t("allergies")}: {r.allergies || t("noAllergies")}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.conversationId ? (
                      <Button size="sm" asChild>
                        <Link to="/inbox/$id" params={{ id: r.conversationId }}>
                          {t("viewRespond")}
                        </Link>
                      </Button>
                    ) : null}
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
                        {st === "under_review"
                          ? t("markReview")
                          : st === "accepted"
                            ? t("offerSpot")
                            : st === "waitlist"
                              ? t("waitlistChild")
                              : t("declineRequest")}
                      </Button>
                    ))}
                  </div>
                </li>
                );
              })
            )}
          </ul>
        </section>

        {listings.map((d) => {
          const st = stats.find((s) => s.daycareId === d.id);
          return (
            <section key={d.id} className="mt-6 rounded-xl bg-surface p-5 ring-1 ring-border">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to="/daycare/$slug" params={{ slug: d.slug }} className="font-display text-2xl hover:underline">
                    {locale === "fr" ? d.nameFr : d.name}
                  </Link>
                  <p className="text-sm text-muted">
                    {d.address}, {d.city} · {d.licenseNumber}
                  </p>
                </div>
                {!d.verified ? (
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-xs">{t("pending")}</span>
                ) : (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">{t("licensed")}</span>
                )}
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
              <CapacityForm daycare={d} onSaved={() => void load()} />
              <PromotePanel daycare={d} onSaved={() => void load()} />
            </section>
          );
        })}

        <section className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border">
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
            <Field label="Postal code" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e })} />
            <Field label={`${t("infantFee")} CAD`} value={String(form.infantMonthly)} onChange={(v) => setForm({ ...form, infantMonthly: Number(v) || 0 })} />
            <Field label={`${t("toddlerFee")} CAD`} value={String(form.toddlerMonthly)} onChange={(v) => setForm({ ...form, toddlerMonthly: Number(v) || 0 })} />
            <Field label={`${t("preschoolFee")} CAD`} value={String(form.preschoolMonthly)} onChange={(v) => setForm({ ...form, preschoolMonthly: Number(v) || 0 })} />
            <div className="sm:col-span-2">
              <Button type="submit">{t("createListing")}</Button>
            </div>
          </form>
        </section>
      </main>
    </Shell>
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
    <div className="mt-6 rounded-xl bg-bg p-4 ring-1 ring-border">
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
            className={cn(
              "rounded-xl px-3 py-3 text-left ring-1 transition-shadow",
              plan === p.id ? "bg-surface ring-2 ring-primary" : "bg-surface ring-border hover:ring-primary/40",
            )}
          >
            <p className="text-sm font-medium">
              {p.id === "week" ? t("promoteWeek") : p.id === "month" ? t("promoteMonth") : t("promoteQuarter")}
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums">{money(p.amount, locale)}</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-subtle">{t("promoteSecure")}</p>
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

function CapacityForm({ daycare, onSaved }: { daycare: Daycare; onSaved: () => void }) {
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
  });
  const preview = state.storefront || daycare.photos[0];

  function onInterior(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_800_000) {
      toast.error(t("photoTooBig"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setState((s) => ({ ...s, interiors: [...s.interiors, String(reader.result ?? "")].slice(0, 5) }));
    reader.readAsDataURL(file);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_800_000) {
      toast.error(t("photoTooBig"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setState((s) => ({ ...s, storefront: String(reader.result ?? "") }));
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
      <h3 className="font-display text-xl">{t("storefrontPhoto")}</h3>
      <p className="text-sm text-muted">{t("storefrontLead")}</p>
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
          <span className="text-muted">{t("storefrontHint")}</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      <p className="text-sm text-muted">{t("interiorPhotoNote")}</p>
      <label className="text-sm">
        {t("interiors")}
        <input type="file" accept="image/*" className="mt-1 block text-sm" onChange={(e) => onInterior(e.target.files?.[0])} />
      </label>
      {state.interiors.length ? (
        <div className="flex flex-wrap gap-2">
          {state.interiors.map((src, i) => (
            <img key={i} src={src} alt="" className="size-16 rounded-md object-cover ring-1 ring-border" />
          ))}
        </div>
      ) : null}
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
      <h3 className="font-display text-xl">{t("agesAccepted")}</h3>
      <p className="text-sm text-muted">{t("agesLead")}</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            [3, 24],
            [12, 36],
            [12, 60],
            [30, 72],
            [3, 72],
          ] as const
        ).map(([min, max]) => (
          <button
            key={`${min}-${max}`}
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-sm ring-1",
              state.ageMinMonths === min && state.ageMaxMonths === max
                ? "bg-primary text-primary-fg ring-primary"
                : "bg-bg text-fg ring-border",
            )}
            onClick={() => setState({ ...state, ageMinMonths: min, ageMaxMonths: max })}
          >
            {formatAgeRange(min, max)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("ageMin")} value={state.ageMinMonths} onChange={(n) => setState({ ...state, ageMinMonths: n })} />
        <Num label={t("ageMax")} value={state.ageMaxMonths} onChange={(n) => setState({ ...state, ageMaxMonths: n })} />
      </div>
      <p className="text-sm tabular-nums text-muted">
        {t("agesAccepted")}: {formatAgeRange(state.ageMinMonths, state.ageMaxMonths)}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Num label={t("spotsInfant")} value={state.spotsInfant} onChange={(n) => setState({ ...state, spotsInfant: n })} />
        <Num label={t("spotsToddler")} value={state.spotsToddler} onChange={(n) => setState({ ...state, spotsToddler: n })} />
        <Num label={t("spotsPreschool")} value={state.spotsPreschool} onChange={(n) => setState({ ...state, spotsPreschool: n })} />
        <Num label={t("infantFee")} value={state.infantMonthly} onChange={(n) => setState({ ...state, infantMonthly: n })} suffix={money(state.infantMonthly, locale)} />
        <Num label={t("toddlerFee")} value={state.toddlerMonthly} onChange={(n) => setState({ ...state, toddlerMonthly: n })} />
        <Num label={t("preschoolFee")} value={state.preschoolMonthly} onChange={(n) => setState({ ...state, preschoolMonthly: n })} />
      </div>
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
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="text-sm">
      {label}
      {suffix ? <span className="ml-1 text-muted">{suffix}</span> : null}
      <input
        type="number"
        className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
