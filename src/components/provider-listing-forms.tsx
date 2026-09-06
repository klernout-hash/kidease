import { useState } from "react";
import { Camera, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PriorityPill } from "@/components/priority-pill";
import { CompletenessChecklist } from "@/components/listing-completeness";
import { VacancyFreshness } from "@/components/vacancy-freshness";
import { listingCompleteness, vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { refreshVacancy, updateListing } from "@/lib/server/claims";
import { promoteListing } from "@/lib/server/promos";
import { PROMO_PLANS, isPriorityActive, type PromoPlanId } from "@/lib/promos";
import { useCopy } from "@/lib/use-copy";
import { cn, money, formatAgeRange } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

export function PromotePanel({ daycare, onSaved }: { daycare: Daycare; onSaved: () => void }) {
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

export function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Shared FileReader + size cap for storefront / licence uploads. */
export const LISTING_PHOTO_MAX_BYTES = 1_800_000;

export function readListingImage(file: File | undefined, onReady: (dataUrl: string) => void, onTooBig: () => void) {
  if (!file) return;
  if (file.size > LISTING_PHOTO_MAX_BYTES) {
    onTooBig();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result ?? ""));
  reader.readAsDataURL(file);
}

export function CapacityForm({
  daycare,
  onSaved,
  mode,
}: {
  daycare: Daycare;
  onSaved: () => void;
  mode: "listing" | "licence";
}) {
  const { t } = useCopy();
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
    hours: daycare.hours,
    licenseNumber: daycare.licenseNumber ?? "",
    storefront: "",
    interiors: [] as string[],
    licensePhoto: "",
  });
  const [refreshing, setRefreshing] = useState(false);
  const draft = {
    ...daycare,
    hours: state.hours,
    licenseNumber: state.licenseNumber,
    spotsInfant: state.spotsInfant,
    spotsToddler: state.spotsToddler,
    spotsPreschool: state.spotsPreschool,
    infantMonthly: state.infantMonthly,
    toddlerMonthly: state.toddlerMonthly,
    preschoolMonthly: state.preschoolMonthly,
    ageMinMonths: state.ageMinMonths,
    ageMaxMonths: state.ageMaxMonths,
    photos: state.storefront ? [state.storefront, ...daycare.photos] : daycare.photos,
    agesKnown: true,
  };
  const complete = listingCompleteness(draft);
  const vacancy = vacancyFreshness(vacancyTimestamp(daycare));
  const preview = state.storefront || daycare.photos[0];

  function readImage(file: File | undefined, into: "storefront" | "interiors" | "license") {
    readListingImage(
      file,
      (value) => {
        if (into === "storefront") setState((s) => ({ ...s, storefront: value }));
        else if (into === "license") setState((s) => ({ ...s, licensePhoto: value }));
        else setState((s) => ({ ...s, interiors: [...s.interiors, value].slice(0, 5) }));
      },
      () => toast.error(t("photoTooBig")),
    );
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
            hours: state.hours,
            licenseNumber: state.licenseNumber,
            touchVacancy: mode === "listing",
          },
        })
          .then(onSaved)
          .then(() => toast.success(t("saveChanges")));
      }}
    >
      {mode === "licence" ? (
        <>
          <p className="text-sm text-muted">Upload a clear photo or scan of the current provincial licence. Required for compliance review.</p>
          <Field label={t("licenceNo")} value={state.licenseNumber} onChange={(v) => setState({ ...state, licenseNumber: v })} />
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
            <Field label={t("hours")} value={state.hours} onChange={(v) => setState({ ...state, hours: v })} />
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
          <div className="rounded-lg bg-bg p-4 ring-1 ring-border">
            <VacancyFreshness item={daycare} className="text-sm" />
            {vacancy.kind === "unknown" ? <p className="text-sm text-muted">{t("vacancyUnknownProvider")}</p> : null}
            {vacancy.kind === "stale" ? <p className="text-sm text-muted">{t("vacancyStaleProvider")}</p> : null}
            <p className="mt-2 text-sm text-muted">{t("vacancyRefreshLead")}</p>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                void refreshVacancy({ data: { daycareId: daycare.id } })
                  .then(() => {
                    toast.success(t("vacancyRefreshed"));
                    onSaved();
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : "Error"))
                  .finally(() => setRefreshing(false));
              }}
            >
              {t("vacancyRefresh")}
            </Button>
          </div>
          <CompletenessChecklist item={{ ...draft, detailsReady: complete.ready, completenessMissing: complete.missing }} />
        </>
      )}
      <Button type="submit" variant="secondary">
        {t("saveChanges")}
      </Button>
    </form>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input type="number" className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
