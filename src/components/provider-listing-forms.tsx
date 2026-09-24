import { useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/success-confirm";
import { Button } from "@/components/ui/button";
import { PriorityPill } from "@/components/priority-pill";
import { ListingHealthPanel } from "@/components/listing-health";
import { ListingReadinessCoach } from "@/components/listing-readiness-coach";
import { VacancyFreshness } from "@/components/vacancy-freshness";
import {
  makeListingCover,
  managedListingPhotos,
  MAX_INTERIOR_PHOTOS,
  MAX_LISTING_PHOTOS,
  moveListingPhoto,
  removeListingPhoto,
} from "@/lib/listing-photo";
import {
  downgradeListingPhotoFile,
  LISTING_PHOTO_ACCEPT,
  listingPhotoByteBudget,
  ListingPhotoPrepareError,
} from "@/lib/listing-photo-downgrade";
import { listingCompleteness, vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { refreshVacancy, updateListing } from "@/lib/server/claims";
import { ListingCultureFields } from "@/components/listing-culture-fields";
import { ProviderParentFields, parentDeskFromDaycare } from "@/components/provider-parent-fields";
import { WaitlistPulseButton } from "@/components/waitlist-pulse-button";
import { promoteListing } from "@/lib/server/promos";
import { PROMO_PLANS, isPriorityActive, type PromoPlanId } from "@/lib/promos";
import { useCopy } from "@/lib/use-copy";
import { isReauthRequiredMessage } from "@/lib/reauth";
import { presentAuthCopy } from "@/lib/auth/present-auth-copy";
import { useReauthPrompt } from "@/components/reauth-dialog";
import { cn, money, formatAgeRange } from "@/lib/utils";
import type { Daycare } from "@/lib/types";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import {
  isListingPhotoTooBig,
  isPrivateDocTooBig,
  LISTING_PHOTO_MAX_BYTES,
} from "@/lib/upload-limits";
import {
  licenseDocHref,
  openPrivateDocHref,
  postPrivateDocForm,
} from "@/lib/private-docs";

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
              confirmAction(t, "editsSaved", { title: t("promotePay") });
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

export function Field({
  label,
  value,
  onChange,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  name?: string;
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        name={name}
        className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export { LISTING_PHOTO_MAX_BYTES };

/** Journal photos still reject over the byte cap. Listing photos are downgraded before upload. */
export function readListingImage(file: File | undefined, onReady: (dataUrl: string) => void, onTooBig: () => void) {
  if (!file) return;
  if (isListingPhotoTooBig(file.size)) {
    onTooBig();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result ?? ""));
  reader.readAsDataURL(file);
}

function listingFormState(daycare: Daycare) {
  return {
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
    licensePhoto: "",
    staffLanguages: daycare.staffLanguages ?? [],
    culturalPrograms: daycare.culturalPrograms ?? [],
    culturalTeamNote: daycare.culturalTeamNote ?? "",
    ...parentDeskFromDaycare(daycare),
  };
}

function listingDeskRevision(daycare: Daycare) {
  return JSON.stringify({
    id: daycare.id,
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
    licensePhotoOnFile: Boolean(daycare.licensePhotoOnFile),
    staffLanguages: daycare.staffLanguages ?? [],
    culturalPrograms: daycare.culturalPrograms ?? [],
    culturalTeamNote: daycare.culturalTeamNote ?? "",
    parent: parentDeskFromDaycare(daycare),
  });
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
  const { t, locale } = useCopy();
  const reauth = useReauthPrompt();
  const serverRev = listingDeskRevision(daycare);
  const [appliedRev, setAppliedRev] = useState(serverRev);
  const [state, setState] = useState(() => listingFormState(daycare));
  const [gallery, setGallery] = useState<string[] | null>(null);
  const [photoJobs, setPhotoJobs] = useState<{ id: string; name: string; progress: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [pendingLicense, setPendingLicense] = useState<File | null>(null);
  const [licenseNeedsConfirm, setLicenseNeedsConfirm] = useState(false);
  const [licenseBusy, setLicenseBusy] = useState(false);
  const licencePrompting = useRef(false);
  if (appliedRev !== serverRev) {
    setAppliedRev(serverRev);
    setState(listingFormState(daycare));
    setGallery(null);
    setPhotoJobs([]);
    setPendingLicense(null);
    setLicenseNeedsConfirm(false);
    setLicenseError(null);
  }
  const savedParent = parentDeskFromDaycare(daycare);
  const serverPhotos = managedListingPhotos(daycare.photos);
  const galleryDirty =
    gallery !== null && (gallery.length !== serverPhotos.length || gallery.some((src, index) => src !== serverPhotos[index]));
  const dirty =
    state.name !== daycare.name ||
    state.address !== daycare.address ||
    state.city !== daycare.city ||
    state.province !== daycare.province ||
    state.postalCode !== daycare.postalCode ||
    state.phone !== (daycare.phone ?? "") ||
    state.email !== (daycare.contactEmail ?? "") ||
    state.spotsInfant !== daycare.spotsInfant ||
    state.spotsToddler !== daycare.spotsToddler ||
    state.spotsPreschool !== daycare.spotsPreschool ||
    state.infantMonthly !== (daycare.infantMonthly ?? 0) ||
    state.toddlerMonthly !== (daycare.toddlerMonthly ?? 0) ||
    state.preschoolMonthly !== (daycare.preschoolMonthly ?? 0) ||
    state.ageMinMonths !== (daycare.agesKnown ? daycare.ageMinMonths : 12) ||
    state.ageMaxMonths !== (daycare.agesKnown ? daycare.ageMaxMonths : 60) ||
    state.hours !== daycare.hours ||
    state.licenseNumber !== (daycare.licenseNumber ?? "") ||
    galleryDirty ||
    Boolean(state.licensePhoto) ||
    JSON.stringify(state.staffLanguages) !== JSON.stringify(daycare.staffLanguages ?? []) ||
    JSON.stringify(state.culturalPrograms) !== JSON.stringify(daycare.culturalPrograms ?? []) ||
    state.culturalTeamNote !== (daycare.culturalTeamNote ?? "") ||
    state.tagline !== (daycare.tagline ?? "") ||
    state.description !== (daycare.description ?? "") ||
    state.partTimeMonthly !== (daycare.partTimeMonthly ?? 0) ||
    state.promoText !== (daycare.promoText ?? "") ||
    state.valuesNote !== (daycare.valuesNote ?? "") ||
    state.facilityType !== savedParent.facilityType ||
    state.openingWindow !== savedParent.openingWindow ||
    JSON.stringify(state.scheduleOptions) !== JSON.stringify(savedParent.scheduleOptions) ||
    JSON.stringify(state.programs) !== JSON.stringify(savedParent.programs) ||
    JSON.stringify(state.financial) !== JSON.stringify(savedParent.financial) ||
    JSON.stringify(state.curriculumTags) !== JSON.stringify(savedParent.curriculumTags) ||
    JSON.stringify(state.safetyFeatures) !== JSON.stringify(savedParent.safetyFeatures) ||
    JSON.stringify(state.amenityKeys) !== JSON.stringify(savedParent.amenityKeys);
  const draft = {
    ...daycare,
    hours: state.hours,
    province: state.province,
    licenseNumber: state.licenseNumber,
    financial: state.financial,
    safetyFeatures: state.safetyFeatures,
    spotsInfant: state.spotsInfant,
    spotsToddler: state.spotsToddler,
    spotsPreschool: state.spotsPreschool,
    infantMonthly: state.infantMonthly,
    toddlerMonthly: state.toddlerMonthly,
    preschoolMonthly: state.preschoolMonthly,
    ageMinMonths: state.ageMinMonths,
    ageMaxMonths: state.ageMaxMonths,
    photos: gallery ?? daycare.photos,
    agesKnown: true,
  };
  const complete = listingCompleteness(draft);
  const vacancy = vacancyFreshness(vacancyTimestamp(daycare));
  const shown = gallery ?? serverPhotos;
  const reserved = shown.length + photoJobs.length;
  const interiorCount = Math.max(0, reserved - (reserved > 0 ? 1 : 0));
  const canAddPhoto = reserved === 0 || (reserved < MAX_LISTING_PHOTOS && interiorCount < MAX_INTERIOR_PHOTOS);

  async function sendLicence(file: File): Promise<"saved" | "confirm" | "error"> {
    setLicenseBusy(true);
    setLicenseError(null);
    try {
      await postPrivateDocForm(licenseDocHref(daycare.id), {}, file);
      setPendingLicense(null);
      setLicenseNeedsConfirm(false);
      confirmAction(t, "licenceUploaded");
      onSaved();
      return "saved";
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      if (isReauthRequiredMessage(raw)) {
        setPendingLicense(file);
        setLicenseNeedsConfirm(true);
        setLicenseError(t("reauthRequired"));
        return "confirm";
      }
      setPendingLicense(null);
      setLicenseNeedsConfirm(false);
      const message = presentAuthCopy(locale, raw) || t("uploadDocTooBig");
      setLicenseError(message);
      toast.error(message);
      return "error";
    } finally {
      setLicenseBusy(false);
    }
  }

  async function promptForLicence(): Promise<boolean> {
    if (licencePrompting.current) return false;
    licencePrompting.current = true;
    try {
      return await reauth.prompt();
    } finally {
      licencePrompting.current = false;
    }
  }

  async function confirmLicence() {
    const file = pendingLicense;
    if (!file || licenseBusy) return;
    const ok = await promptForLicence();
    if (!ok) return;
    await sendLicence(file);
  }

  async function addListingPhotos(files: File[]) {
    if (!files.length) return;
    const room = MAX_LISTING_PHOTOS - (shown.length + photoJobs.length);
    if (room <= 0) {
      const message = t("photoAtCap");
      setPhotoError(message);
      toast.error(message);
      return;
    }
    const take = files.slice(0, room);
    if (files.length > room) {
      const message = t("photoOverflow");
      setPhotoError(message);
      toast.error(message);
    } else {
      setPhotoError(null);
    }
    const targetBytes = listingPhotoByteBudget(MAX_LISTING_PHOTOS);
    for (const file of take) {
      const id = `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`;
      setPhotoJobs((jobs) => [...jobs, { id, name: file.name || t("storefrontPhoto"), progress: 8 }]);
      try {
        const dataUrl = await downgradeListingPhotoFile(file, {
          targetBytes,
          onProgress: (n) => {
            setPhotoJobs((jobs) => jobs.map((job) => (job.id === id ? { ...job, progress: n } : job)));
          },
        });
        setGallery((current) => {
          const start = current ?? managedListingPhotos(daycare.photos);
          if (start.length >= MAX_LISTING_PHOTOS) return start;
          return [...start, dataUrl];
        });
      } catch (err) {
        const unreadable = err instanceof ListingPhotoPrepareError && err.code === "unreadable";
        const message = t(unreadable ? "photoUnreadable" : "photoTooBig");
        setPhotoError(message);
        toast.error(message);
      } finally {
        setPhotoJobs((jobs) => jobs.filter((job) => job.id !== id));
      }
    }
  }

  return (
    <>
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
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
            storefront: undefined,
            interiors: [],
            managedPhotos: galleryDirty ? (gallery ?? []) : undefined,
            licensePhoto: undefined,
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
            staffLanguages: state.staffLanguages,
            culturalPrograms: state.culturalPrograms,
            culturalTeamNote: state.culturalTeamNote,
            tagline: state.tagline,
            description: state.description,
            partTimeMonthly: state.partTimeMonthly,
            amenities: state.amenityKeys.join(","),
            facilityType: state.facilityType,
            scheduleOptions: state.scheduleOptions,
            openingWindow: state.openingWindow,
            programs: state.programs,
            financial: state.financial,
            curriculumTags: state.curriculumTags,
            valuesNote: state.valuesNote,
            safetyFeatures: state.safetyFeatures,
            promoText: state.promoText,
          },
        })
          .then(() => onSaved())
          .then(() => {
            const photo = galleryDirty;
            const spots =
              state.spotsInfant !== daycare.spotsInfant ||
              state.spotsToddler !== daycare.spotsToddler ||
              state.spotsPreschool !== daycare.spotsPreschool;
            const fees =
              state.infantMonthly !== (daycare.infantMonthly ?? 0) ||
              state.toddlerMonthly !== (daycare.toddlerMonthly ?? 0) ||
              state.preschoolMonthly !== (daycare.preschoolMonthly ?? 0);
            const id =
              photo && !spots && !fees
                ? "photoUploaded"
                : spots && !fees && !photo
                  ? "openingsUpdated"
                  : fees && !spots && !photo
                    ? "feesUpdated"
                    : "listingEdits";
            confirmAction(t, id);
            setGallery(null);
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : "Error"))
          .finally(() => setSaving(false));
      }}
    >
      {mode === "licence" ? (
        <>
          <p className="text-sm text-muted">{t("licenceUploadLead")}</p>
          <Field label={t("licenceNo")} value={state.licenseNumber} onChange={(v) => setState({ ...state, licenseNumber: v })} />
          <label className="block text-sm font-medium">
            {t("licensePhoto")}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-sm"
              data-ke="licence-file"
              disabled={licenseBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || licenseBusy) return;
                if (isPrivateDocTooBig(file.size)) {
                  const message = t("uploadDocTooBig");
                  setLicenseNeedsConfirm(false);
                  setPendingLicense(null);
                  setLicenseError(message);
                  toast.error(message);
                  return;
                }
                void (async () => {
                  const result = await sendLicence(file);
                  if (result !== "confirm") return;
                  const ok = await promptForLicence();
                  if (!ok) return;
                  await sendLicence(file);
                })();
              }}
            />
            <UploadLimitHint hint={t("uploadDocHint")} error={licenseError} />
          </label>
          {licenseNeedsConfirm && pendingLicense ? (
            <div className="space-y-2" data-ke="licence-reauth">
              <p className="text-sm text-fg">{t("reauthKeptFile").replace("{name}", pendingLicense.name)}</p>
              <Button type="button" disabled={licenseBusy} onClick={() => void confirmLicence()}>
                {licenseBusy ? t("reauthChecking") : t("reauthTitle")}
              </Button>
            </div>
          ) : null}
          {daycare.licensePhotoOnFile ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ok">{t("licenceOnFile")}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => openPrivateDocHref(licenseDocHref(daycare.id))}>
                {t("licenceViewFile")}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <ListingReadinessCoach item={draft} variant="editor" />
          <ListingHealthPanel item={{ ...draft, detailsReady: complete.ready, completenessMissing: complete.missing }} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="listing-health-photo" className="font-display text-xl">{t("storefrontPhoto")}</h3>
            <p data-ke="listing-photo-count" className="text-sm tabular-nums text-muted">
              {t("photoCount").replace("{n}", String(shown.length)).replace("{max}", String(MAX_LISTING_PHOTOS))}
            </p>
          </div>
          <h3 className="font-display text-xl">{t("interiors")}</h3>
          <p className="text-sm text-muted">{t("interiorPhotoNote")}</p>
          <UploadLimitHint hint={t("uploadPhotoHint")} error={photoError} />
          {shown.length >= MAX_LISTING_PHOTOS ? <p className="text-sm text-muted">{t("photoAtCap")}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map((src, i) => (
              <div key={`${i}-${src.slice(-24)}`} data-ke="listing-photo-card" className="rounded-lg bg-bg p-2 ring-1 ring-border">
                <div className="relative">
                  <img src={src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                  {i === 0 ? (
                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-fg">{t("photoCover")}</span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    data-ke="listing-photo-earlier"
                    aria-label={t("photoMoveEarlier")}
                    disabled={i === 0}
                    onClick={() =>
                      setGallery((current) => {
                        const list = current ?? serverPhotos;
                        const index = list.indexOf(src);
                        return index < 0 ? list : moveListingPhoto(list, index, -1);
                      })
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    data-ke="listing-photo-later"
                    aria-label={t("photoMoveLater")}
                    disabled={i === shown.length - 1}
                    onClick={() =>
                      setGallery((current) => {
                        const list = current ?? serverPhotos;
                        const index = list.indexOf(src);
                        return index < 0 ? list : moveListingPhoto(list, index, 1);
                      })
                    }
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  {i > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      data-ke="listing-photo-cover"
                      onClick={() =>
                        setGallery((current) => {
                          const list = current ?? serverPhotos;
                          const index = list.indexOf(src);
                          return index < 0 ? list : makeListingCover(list, index);
                        })
                      }
                    >
                      {t("photoMakeCover")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    data-ke="listing-photo-delete"
                    aria-label={t("photoDelete")}
                    onClick={() =>
                      setGallery((current) => {
                        const list = current ?? serverPhotos;
                        const index = list.indexOf(src);
                        return index < 0 ? list : removeListingPhoto(list, index);
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {photoJobs.map((job) => (
              <div key={job.id} data-ke="listing-photo-progress" className="flex aspect-[4/3] flex-col justify-end rounded-lg bg-bg p-3 ring-1 ring-border">
                <p className="text-sm text-muted">{t("photoPreparing").replace("{name}", job.name).replace("{n}", String(job.progress))}</p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={job.progress}
                  aria-label={job.name}
                >
                  <div className="h-full bg-primary" style={{ width: `${job.progress}%` }} />
                </div>
              </div>
            ))}
            {canAddPhoto ? (
              <label data-ke="listing-photo-add" className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-bg px-3 text-center text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-primary">
                  <Camera className="size-4" />
                  {shown.length === 0 ? t("storefrontCta") : t("interiorCta")}
                </span>
                <input
                  type="file"
                  accept={LISTING_PHOTO_ACCEPT}
                  multiple
                  className="sr-only"
                  data-ke="listing-photo-input"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    e.target.value = "";
                    void addListingPhotos(files);
                  }}
                />
              </label>
            ) : null}
          </div>
          <h3 className="font-display text-xl">{t("businessDetails")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("centreName")} value={state.name} onChange={(v) => setState({ ...state, name: v })} />
            <Field label={t("addressLabel")} value={state.address} onChange={(v) => setState({ ...state, address: v })} />
            <Field label={t("cityLabel")} value={state.city} onChange={(v) => setState({ ...state, city: v })} />
            <div id="listing-health-province">
              <Field label={t("provinceLabel")} value={state.province} onChange={(v) => setState({ ...state, province: v })} />
            </div>
            <Field label={t("postalLabel")} value={state.postalCode} onChange={(v) => setState({ ...state, postalCode: v })} />
            <Field label={t("phoneLabel")} value={state.phone} onChange={(v) => setState({ ...state, phone: v })} />
            <Field label={t("contactEmail")} value={state.email} onChange={(v) => setState({ ...state, email: v })} />
            <div id="listing-health-hours">
              <Field label={t("hours")} value={state.hours} onChange={(v) => setState({ ...state, hours: v })} />
            </div>
          </div>
          <div id="listing-health-fees" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Num label={t("spotsInfant")} value={state.spotsInfant} onChange={(n) => setState({ ...state, spotsInfant: n })} />
            <Num label={t("spotsToddler")} value={state.spotsToddler} onChange={(n) => setState({ ...state, spotsToddler: n })} />
            <Num label={t("spotsPreschool")} value={state.spotsPreschool} onChange={(n) => setState({ ...state, spotsPreschool: n })} />
            <Num label={t("infantFee")} value={state.infantMonthly} onChange={(n) => setState({ ...state, infantMonthly: n })} />
            <Num label={t("toddlerFee")} value={state.toddlerMonthly} onChange={(n) => setState({ ...state, toddlerMonthly: n })} />
            <Num label={t("preschoolFee")} value={state.preschoolMonthly} onChange={(n) => setState({ ...state, preschoolMonthly: n })} />
          </div>
          <div id="listing-health-ages" className="grid gap-3 sm:grid-cols-2">
            <Num label={t("ageMin")} value={state.ageMinMonths} onChange={(n) => setState({ ...state, ageMinMonths: n })} />
            <Num label={t("ageMax")} value={state.ageMaxMonths} onChange={(n) => setState({ ...state, ageMaxMonths: n })} />
            <p className="text-sm tabular-nums text-muted sm:col-span-2">
              {t("agesAccepted")}: {formatAgeRange(state.ageMinMonths, state.ageMaxMonths)}
            </p>
          </div>
          <ListingCultureFields
            value={{
              staffLanguages: state.staffLanguages,
              culturalPrograms: state.culturalPrograms,
              culturalTeamNote: state.culturalTeamNote,
            }}
            onChange={(culture) => setState({ ...state, ...culture })}
          />
          <div id="listing-health-subsidy">
            <div id="listing-health-policies">
              <ProviderParentFields
                value={parentDeskFromDaycare({ ...daycare, ...state, amenities: state.amenityKeys.join(",") })}
                onChange={(parent) => setState({ ...state, ...parent })}
              />
            </div>
          </div>
          <div id="listing-health-vacancy" className="rounded-lg bg-bg p-4 ring-1 ring-border">
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
                    confirmAction(t, "openingsUpdated");
                    onSaved();
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : "Error"))
                  .finally(() => setRefreshing(false));
              }}
            >
              {t("vacancyRefresh")}
            </Button>
            <WaitlistPulseButton daycareId={daycare.id} onPulsed={onSaved} />
          </div>
        </>
      )}
      <Button type="submit" variant="secondary" disabled={!dirty || saving}>
        {t("saveChanges")}
      </Button>
    </form>
    {reauth.dialog}
    </>
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
