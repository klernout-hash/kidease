import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { localePath } from "@/lib/locale-path";
import { BuildingPhoto } from "@/components/building-photo";
import { CapacityForm } from "@/components/provider-listing-forms";
import { KidEaseApprovalStrip } from "@/components/kidease-approval";
import { ProviderTrustChecklist } from "@/components/provider-trust";
import { publicApprovalEligible } from "@/lib/approve-live";
import { managedListingPhotos } from "@/lib/listing-photo";
import {
  CENTRE_SECTIONS,
  GUIDE_SECTIONS,
  sectionSummary,
  sectionTitle,
  type FamilyGuide,
  type HostSection,
} from "@/lib/host-listing";
import { hostCopy } from "@/lib/host-listing-copy";
import { loadFamilyGuide, saveFamilyGuide } from "@/lib/server/host-calendar";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Daycare } from "@/lib/types";

export function HostListingsDesk({
  listings,
  onSaved,
  onOpenChange,
  initialSection,
  initialCentre,
}: {
  listings: Daycare[];
  onSaved: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
  initialSection?: HostSection | null;
  initialCentre?: string | null;
}) {
  const { locale } = useCopy();
  const copy = hostCopy(locale);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = listings.find((row) => row.id === openId) ?? null;

  useEffect(() => {
    if (!initialSection || !listings.length) return;
    const id = listings.some((row) => row.id === initialCentre) ? initialCentre : listings[0]?.id;
    if (!id) return;
    setOpenId(id);
    onOpenChange?.(true);
  }, [initialSection, initialCentre, listings, onOpenChange]);

  function choose(id: string | null) {
    setOpenId(id);
    onOpenChange?.(id != null);
  }

  if (!listings.length) {
    return (
      <section className="rounded-xl bg-surface px-4 py-6 ring-1 ring-border" data-ke="host-listings">
        <p className="text-sm text-muted">{copy.emptyListings}</p>
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center font-medium text-primary touch-manipulation"
          onClick={() => document.getElementById("list-new")?.scrollIntoView({ block: "start" })}
        >
          {copy.addCentre}
        </button>
      </section>
    );
  }

  if (open) {
    return (
      <HostEditor
        daycare={open}
        onBack={() => choose(null)}
        onSaved={onSaved}
        initialSection={open.id === (initialCentre || listings[0]?.id) ? initialSection : null}
      />
    );
  }

  return (
    <div className="space-y-3" data-ke="host-listings">
      <ul className="grid gap-3 sm:grid-cols-2">
        {listings.map((row) => {
          const photo = managedListingPhotos(row.photos)[0] ?? "";
          return (
            <li key={row.id}>
              <button
                type="button"
                data-ke="host-listing-card"
                className="w-full overflow-hidden rounded-[16px] bg-white text-left shadow-sm ring-1 ring-black/8 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#1B2230] dark:ring-white/10"
                onClick={() => choose(row.id)}
              >
                <span className="relative block">
                  <BuildingPhoto
                    src={photo}
                    alt={photo ? row.name : ""}
                    className="aspect-[4/3] w-full bg-[#F7F8FA] object-cover dark:bg-[#11151C]"
                    width={640}
                    height={480}
                  />
                  {!photo ? (
                    <span className="absolute inset-0 grid place-items-center px-4 text-center text-sm font-medium text-muted" data-ke="host-card-no-photo">
                      {locale === "fr" ? "Photo non disponible" : "Photo not available"}
                    </span>
                  ) : null}
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold leading-4 text-[#11151C] shadow-sm">
                    {row.live ? (locale === "fr" ? "Publiée" : "Listed") : locale === "fr" ? "Pas publiée" : "Not published"}
                  </span>
                </span>
                <span className="block px-4 py-3">
                  <span className="block text-[16px] font-semibold leading-[22px] text-fg">{row.name}</span>
                  <span className="mt-1 block text-[14px] leading-5 text-muted">{row.city}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="inline-flex min-h-11 items-center font-medium text-primary touch-manipulation"
        onClick={() => {
          const el = document.getElementById("list-new");
          if (el instanceof HTMLDetailsElement) el.open = true;
          el?.scrollIntoView({ block: "start" });
        }}
      >
        {copy.addCentre}
      </button>
    </div>
  );
}

function PublishedPreview({ slug, locale, prominent = false }: { slug: string; locale: string; prominent?: boolean }) {
  if (!slug) return null;
  const label = locale === "fr" ? "Aperçu de la fiche publiée" : "Preview published listing";
  return (
    <p className={prominent ? "" : "mt-3 text-sm"} data-ke="host-preview">
      <a
        href={localePath(`/daycare/${slug}`, locale)}
        target="_blank"
        rel="noreferrer"
        className={
          prominent
            ? "inline-flex min-h-11 items-center justify-center rounded-full bg-[#11151C] px-4 text-sm font-semibold text-white touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white dark:text-[#11151C]"
            : "inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
        }
      >
        {label}
      </a>
      {prominent ? null : (
        <span className="mt-1 block text-muted">
          {locale === "fr"
            ? "Ouvre la page que les parents voient. Ce n’est pas un brouillon."
            : "Opens the page parents see. This is not a draft."}
        </span>
      )}
    </p>
  );
}

function pickSections(source: readonly HostSection[], ids: readonly HostSection[]): HostSection[] {
  return source.filter((id) => ids.includes(id));
}

function sectionGroups(tab: "centre" | "guide", locale: string): Array<{ title: string; ids: HostSection[] }> {
  const fr = locale === "fr";
  if (tab === "guide") {
    return [
      { title: fr ? "Arrivée" : "Arrival", ids: pickSections(GUIDE_SECTIONS, ["dropoff", "bring"]) },
      { title: fr ? "Guide écrit" : "Written guide", ids: pickSections(GUIDE_SECTIONS, ["handbook"]) },
      { title: fr ? "Joindre le centre" : "Reach the centre", ids: pickSections(GUIDE_SECTIONS, ["contact"]) },
    ];
  }
  return [
    { title: fr ? "Photos et nom" : "Photos and name", ids: pickSections(CENTRE_SECTIONS, ["photos", "name", "french"]) },
    { title: fr ? "Lieu et heures" : "Place and hours", ids: pickSections(CENTRE_SECTIONS, ["location"]) },
    {
      title: fr ? "Âges, programmes et frais" : "Ages, programs and fees",
      ids: pickSections(CENTRE_SECTIONS, ["ages", "programs", "fees", "languages"]),
    },
    {
      title: fr ? "Repas, lieux et sécurité" : "Meals, place and safety",
      ids: pickSections(CENTRE_SECTIONS, ["meals", "amenities", "safety", "policies"]),
    },
    { title: fr ? "Mots pour les familles" : "Words for families", ids: pickSections(CENTRE_SECTIONS, ["promo", "values"]) },
    { title: fr ? "Vérification" : "Checks", ids: pickSections(CENTRE_SECTIONS, ["health"]) },
  ];
}

function HostEditor({
  daycare,
  onBack,
  onSaved,
  initialSection,
}: {
  daycare: Daycare;
  onBack: () => void;
  onSaved: () => void | Promise<void>;
  initialSection?: HostSection | null;
}) {
  const { t, locale } = useCopy();
  const copy = hostCopy(locale);
  const [tab, setTab] = useState<"centre" | "guide">("centre");
  const [section, setSection] = useState<HostSection | null>(initialSection ?? null);
  const [guide, setGuide] = useState<FamilyGuide | null>(null);

  useEffect(() => {
    let live = true;
    void loadFamilyGuide({ data: daycare.id })
      .then((row) => {
        if (live) setGuide(row);
      })
      .catch(() => {
        if (live) setGuide({ dropoff: "", bring: "", handbook: "" });
      });
    return () => {
      live = false;
    };
  }, [daycare.id]);

  async function saveGuide(next: FamilyGuide) {
    await saveFamilyGuide({ data: { daycareId: daycare.id, ...next } });
    setGuide(next);
  }

  const [dirty, setDirty] = useState(false);

  function leaveSection() {
    if (dirty) {
      const ok = window.confirm(
        locale === "fr"
          ? "Quitter sans enregistrer? Les changements non enregistrés seront perdus."
          : "Leave without saving? Unsaved changes will be lost.",
      );
      if (!ok) return;
    }
    setDirty(false);
    setSection(null);
  }

  if (section) {
    return (
      <div data-ke="host-section" data-section={section} className="mx-auto w-full max-w-[720px] pb-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={leaveSection}
          >
            <ChevronLeft className="size-5" aria-hidden />
            {t("back")}
          </button>
          <PublishedPreview slug={daycare.slug} locale={locale} prominent />
        </div>
        <h2 className="mt-2 text-balance text-[24px] font-semibold leading-[30px]">{sectionTitle(section, locale)}</h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">
          {locale === "fr"
            ? "Les changements restent ici jusqu’à l’enregistrement. L’aperçu ouvre la fiche publiée, pas un brouillon."
            : "Changes stay here until you save. Preview opens the published listing, not a draft."}
        </p>
        <CapacityForm
          daycare={daycare}
          mode="listing"
          focus={section}
          guide={guide}
          onGuide={saveGuide}
          onDirtyChange={setDirty}
          onSaved={() => {
            setDirty(false);
            void onSaved();
          }}
        />
        {section === "health" ? (
          <div className="mt-4 space-y-3">
            <KidEaseApprovalStrip eligible={publicApprovalEligible(daycare)} audience="daycare" />
            <ProviderTrustChecklist daycare={daycare} onSaved={() => void onSaved()} />
          </div>
        ) : null}
      </div>
    );
  }

  const photos = managedListingPhotos(daycare.photos);
  const cover = photos[0] ?? "";

  return (
    <div data-ke="host-editor" className="mx-auto w-full max-w-[1120px] pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-1">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("back")}
            onClick={onBack}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 pt-2">
            <p className="text-[14px] leading-5 text-muted">{copy.editor}</p>
            <h2 className="text-balance text-[24px] font-semibold leading-[30px]">{daycare.name}</h2>
          </div>
        </div>
        <PublishedPreview slug={daycare.slug} locale={locale} prominent />
      </div>
      {cover ? (
        <div className="relative mt-4 overflow-hidden rounded-[16px]" data-ke="host-cover">
          <BuildingPhoto src={cover} alt="" className="aspect-[4/3] max-h-80 w-full object-cover" width={960} height={720} />
          <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-[12px] font-medium text-white">
            {photos.length} {locale === "fr" ? "photos" : photos.length === 1 ? "photo" : "photos"}
          </span>
          <button
            type="button"
            className="absolute bottom-3 right-3 inline-flex min-h-11 items-center rounded-full bg-white px-3 text-sm font-semibold text-[#11151C] shadow-sm touch-manipulation"
            onClick={() => setSection("photos")}
          >
            {locale === "fr" ? "Gérer les photos" : "Manage photos"}
          </button>
        </div>
      ) : (
        <div
          className="mt-4 grid min-h-48 place-items-center rounded-[16px] bg-[#F7F8FA] px-6 py-10 text-center ring-1 ring-black/5 dark:bg-[#11151C] dark:ring-white/10"
          data-ke="host-cover-empty"
        >
          <div>
            <p className="text-[16px] font-semibold leading-[22px]">
              {locale === "fr" ? "Photo non disponible" : "Photo not available"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[14px] leading-5 text-muted">
              {locale === "fr"
                ? "Ajoutez une photo du centre. N’utilisez pas de photo d’enfant."
                : "Add a photo of the centre. Do not use a photo of a child."}
            </p>
            <button
              type="button"
              className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary touch-manipulation"
              onClick={() => setSection("photos")}
            >
              {locale === "fr" ? "Ajouter des photos" : "Add photos"}
            </button>
          </div>
        </div>
      )}
      <div role="tablist" aria-label={copy.editor} className="mt-5 inline-flex max-w-full rounded-full bg-[#F7F8FA] p-1 ring-1 ring-black/5 dark:bg-[#11151C] dark:ring-white/10">
        {(
          [
            ["centre", copy.yourCentre],
            ["guide", copy.familyGuide],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn(
              "min-h-11 rounded-full px-4 text-sm font-semibold touch-manipulation",
              tab === id ? "bg-white text-[#11151C] shadow-sm dark:bg-[#1B2230] dark:text-white" : "text-muted",
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6 space-y-6">
        {sectionGroups(tab, locale).map((group) => (
          <section key={group.title} data-ke="host-section-group" aria-label={group.title}>
            <h3 className="text-[18px] font-semibold leading-6">{group.title}</h3>
            <ul className="mt-3 space-y-3">
              {group.ids.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    data-ke="host-section-card"
                    data-section={id}
                    className="flex w-full items-center gap-3 rounded-[16px] bg-white px-4 py-4 text-left shadow-sm ring-1 ring-black/8 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#1B2230] dark:ring-white/10"
                    onClick={() => setSection(id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold leading-[22px]">{sectionTitle(id, locale)}</span>
                      <span className="mt-0.5 block text-[14px] leading-5 text-muted">{sectionSummary(id, daycare, locale, guide)}</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted">
        {locale === "fr"
          ? "L’aperçu ouvre la fiche publiée, pas un brouillon. Les faits du registre restent verrouillés."
          : "Preview opens the published listing, not a draft. Registry facts stay locked."}
      </p>
    </div>
  );
}
