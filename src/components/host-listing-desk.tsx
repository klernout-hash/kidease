import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { localePath } from "@/lib/locale-path";
import { BuildingPhoto } from "@/components/building-photo";
import { CapacityForm } from "@/components/provider-listing-forms";
import { KidEaseApprovalStrip } from "@/components/kidease-approval";
import { ProviderTrustChecklist } from "@/components/provider-trust";
import { publicApprovalEligible } from "@/lib/approve-live";
import { managedListingPhotos } from "@/lib/listing-photo";
import {
  DEMO_DAYCARE_PHOTOS,
  centrePublication,
  demoPhotoAlt,
  filterOwnedCentres,
  usesDemoPhotoPreview,
} from "@/lib/host-listings-overview";
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

const VIEW_KEY = "ke-host-listing-view";

export function HostListingsDesk({
  listings,
  onSaved,
  onOpenChange,
  onCreateListing,
  initialSection,
  initialCentre,
}: {
  listings: Daycare[];
  onSaved: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
  /** Opens the existing create-listing form. Claim stays a link to /claim. */
  onCreateListing?: () => void;
  initialSection?: HostSection | null;
  initialCentre?: string | null;
}) {
  const { t, locale } = useCopy();
  const copy = hostCopy(locale);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "rows">("cards");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dialogTitleId = useId();
  const open = listings.find((row) => row.id === openId) ?? null;
  const noPhoto = locale === "fr" ? "Photo non disponible" : "Photo not available";

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(VIEW_KEY);
      if (saved === "rows" || saved === "cards") setView(saved);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (!initialSection || !listings.length) return;
    const id = listings.some((row) => row.id === initialCentre) ? initialCentre : listings[0]?.id;
    if (!id) return;
    setOpenId(id);
    onOpenChange?.(true);
  }, [initialSection, initialCentre, listings, onOpenChange]);

  useEffect(() => {
    if (!addOpen) return;
    const root = dialogRef.current;
    const items = () =>
      Array.from(root?.querySelectorAll<HTMLElement>("button, a[href]") ?? []).filter((el) => !el.hasAttribute("disabled"));
    items()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setAddOpen(false);
        queueMicrotask(() => (returnFocus.current ?? addRef.current)?.focus());
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const focusable = items();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen]);

  function choose(id: string | null) {
    setOpenId(id);
    onOpenChange?.(id != null);
  }

  function setViewMode(next: "cards" | "rows") {
    setView(next);
    try {
      sessionStorage.setItem(VIEW_KEY, next);
    } catch {
      /* private mode */
    }
  }

  function openAdd() {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : addRef.current;
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    queueMicrotask(() => (returnFocus.current ?? addRef.current)?.focus());
  }

  function cancelSearch() {
    setQuery("");
    setSearchOpen(false);
  }

  function startCreate() {
    closeAdd();
    if (onCreateListing) {
      onCreateListing();
      return;
    }
    const el = document.getElementById("list-new");
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: "start" });
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

  const matches = filterOwnedCentres(listings, query);
  const listed = matches.filter((row) => centrePublication(row.live) === "listed");
  const unpublished = matches.filter((row) => centrePublication(row.live) === "unpublished");
  const groups = [
    listed.length ? { id: "listed" as const, label: copy.listed, rows: listed } : null,
    unpublished.length ? { id: "unpublished" as const, label: copy.notPublished, rows: unpublished } : null,
  ].filter((group) => group != null);

  return (
    <div className="pb-8" data-ke="host-listings" data-view={view}>
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-balance font-display text-[1.75rem] font-bold leading-tight md:text-[2rem]">{copy.yourCentres}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface shadow-card ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={copy.searchCentres}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen(true);
              queueMicrotask(() => searchRef.current?.focus());
            }}
          >
            <Search className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface shadow-card ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={view === "cards" ? copy.listView : copy.cardView}
            aria-pressed={view === "rows"}
            onClick={() => setViewMode(view === "cards" ? "rows" : "cards")}
          >
            {view === "cards" ? <List className="size-5" aria-hidden /> : <LayoutGrid className="size-5" aria-hidden />}
          </button>
          <button
            ref={addRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface shadow-card ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={copy.addCentre}
            aria-haspopup="dialog"
            aria-expanded={addOpen}
            onClick={openAdd}
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      {searchOpen ? (
        <div className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor="host-centre-search">
            {copy.searchCentres}
          </label>
          <input
            ref={searchRef}
            id="host-centre-search"
            type="search"
            value={query}
            placeholder={copy.searchPlaceholder}
            data-ke="host-listings-search"
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-base text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setQuery(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelSearch();
              }
            }}
          />
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-2 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={cancelSearch}
          >
            {t("cancel")}
          </button>
        </div>
      ) : null}
      {!listings.length ? (
        <section className="mt-6" data-ke="host-listings-empty">
          <p className="text-sm text-muted">{copy.emptyListings}</p>
        </section>
      ) : null}
      {listings.length && !matches.length ? (
        <section className="mt-6" data-ke="host-listings-empty">
          <p className="text-sm text-muted">{copy.noSearchMatch}</p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center font-medium text-primary touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={cancelSearch}
          >
            {copy.clearSearch}
          </button>
        </section>
      ) : null}
      <div className="mt-4 space-y-6">
        {groups.map((group) => (
          <section key={group.id} aria-label={group.label}>
            <h2 className="text-sm font-semibold text-fg">{group.label}</h2>
            {view === "rows" ? (
              <ul className="mt-1 divide-y divide-border">
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <CentreRow row={row} copy={copy} noPhoto={noPhoto} layout="rows" onOpen={() => choose(row.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-3 grid gap-5 sm:grid-cols-2">
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <CentreRow row={row} copy={copy} noPhoto={noPhoto} layout="cards" onOpen={() => choose(row.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {addOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
          <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("close")} onClick={closeAdd} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            data-ke="host-add-centre"
            className="relative z-10 w-full max-w-lg rounded-t-2xl bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-card ring-1 ring-border md:rounded-2xl md:pb-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id={dialogTitleId} className="font-display text-2xl font-bold">
                {copy.addCentre}
              </h2>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-full touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("close")}
                onClick={closeAdd}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">{copy.addChooserLead}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                to="/claim"
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-base font-semibold text-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={closeAdd}
              >
                {t("providerOnboardingClaim")}
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-left text-base font-semibold text-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-ke="host-add-create"
                onClick={startCreate}
              >
                {t("providerOnboardingListNew")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CentreRow({
  row,
  copy,
  noPhoto,
  layout,
  onOpen,
}: {
  row: Daycare;
  copy: ReturnType<typeof hostCopy>;
  noPhoto: string;
  layout: "cards" | "rows";
  onOpen: () => void;
}) {
  const demo = usesDemoPhotoPreview(row);
  const stored = managedListingPhotos(row.photos)[0] ?? "";
  const photo = demo ? DEMO_DAYCARE_PHOTOS[0] : stored;
  const status = centrePublication(row.live) === "listed" ? copy.listed : copy.notPublished;
  const alt = demo ? demoPhotoAlt(copy.demoPhotoAlt, 1, DEMO_DAYCARE_PHOTOS.length) : photo ? row.name : "";
  const coverClass =
    layout === "rows"
      ? "size-16 shrink-0 rounded-xl object-cover"
      : "aspect-[16/10] max-h-44 w-full rounded-2xl object-cover";
  return (
    <button
      type="button"
      data-ke="host-listing-card"
      data-layout={layout}
      data-demo={demo ? "preview" : undefined}
      className={
        layout === "rows"
          ? "flex min-h-11 w-full items-center gap-3 py-3 text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : "w-full text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
      onClick={onOpen}
    >
      <span className={layout === "rows" ? "relative shrink-0" : "relative block"}>
        {photo ? (
          demo ? (
            <img src={photo} alt={alt} width={layout === "rows" ? 128 : 640} height={layout === "rows" ? 128 : 400} className={coverClass} />
          ) : (
            <BuildingPhoto src={photo} alt={alt} className={coverClass} width={layout === "rows" ? 128 : 640} height={layout === "rows" ? 128 : 400} />
          )
        ) : (
          <span
            className={
              layout === "rows"
                ? "grid size-16 place-items-center rounded-xl bg-surface-2 px-1 text-center text-[11px] leading-tight text-muted"
                : "grid aspect-[16/10] max-h-44 w-full place-items-center rounded-2xl bg-surface-2 px-4 text-center text-sm text-muted"
            }
            data-ke="host-card-no-photo"
          >
            {noPhoto}
          </span>
        )}
        {demo ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-[#11151C]">
            {copy.demoLabel}
          </span>
        ) : null}
        {layout === "cards" ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold leading-4 text-[#11151C] shadow-sm">
            {status}
          </span>
        ) : null}
      </span>
      <span className={layout === "rows" ? "min-w-0 flex-1" : "mt-2 block"}>
        <span className="block truncate text-[16px] font-semibold leading-[22px] text-fg">{row.name}</span>
        <span className="mt-0.5 block truncate text-[14px] leading-5 text-muted">{row.city}</span>
      </span>
      {layout === "rows" ? (
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold leading-4 text-fg ring-1 ring-border">
          {status}
        </span>
      ) : null}
    </button>
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
    { title: fr ? "Nom" : "Name", ids: pickSections(CENTRE_SECTIONS, ["name", "french"]) },
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
  const demoPreview = usesDemoPhotoPreview(daycare);
  const cover = demoPreview ? DEMO_DAYCARE_PHOTOS[0] : photos[0] ?? "";

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
      <button
        type="button"
        data-ke="host-cover"
        data-section="photos"
        className="mt-4 w-full rounded-[16px] bg-surface p-4 text-left ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setSection("photos")}
      >
        <span className="block text-[16px] font-semibold leading-[22px]">{locale === "fr" ? "Visite photo" : "Photo tour"}</span>
        <span className="mt-0.5 block text-[14px] leading-5 text-muted">
          {demoPreview
            ? copy.demoPreviewLead
            : photos.length
              ? `${photos.length} ${locale === "fr" ? "photos" : photos.length === 1 ? "photo" : "photos"}`
              : locale === "fr"
                ? "Photo non disponible"
                : "Photo not available"}
        </span>
        {demoPreview ? (
          <span className="mt-3 grid grid-cols-5 gap-1.5" data-ke="demo-photo-preview">
            {DEMO_DAYCARE_PHOTOS.map((src, index) => (
              <img
                key={src}
                src={src}
                alt={demoPhotoAlt(copy.demoPhotoAlt, index + 1, DEMO_DAYCARE_PHOTOS.length)}
                width={192}
                height={144}
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
            ))}
          </span>
        ) : cover ? (
          <span className="relative mt-3 block">
            <BuildingPhoto src={cover} alt="" className="aspect-[16/10] max-h-56 w-full rounded-[16px] object-cover" width={960} height={600} />
            <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-[12px] font-medium text-white">
              {photos.length} {locale === "fr" ? "photos" : photos.length === 1 ? "photo" : "photos"}
            </span>
          </span>
        ) : (
          <span className="mt-3 grid min-h-36 place-items-center rounded-[16px] bg-[#F7F8FA] px-4 text-center text-sm text-muted dark:bg-[#11151C]" data-ke="host-cover-empty">
            {locale === "fr" ? "Ajouter des photos du centre. Pas de photo d’enfant." : "Add photos of the centre. Do not add a photo of a child."}
          </span>
        )}
        <span className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">
          {cover ? (locale === "fr" ? "Gérer les photos" : "Manage photos") : locale === "fr" ? "Ajouter des photos" : "Add photos"}
        </span>
      </button>
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
              tab === id ? "bg-surface text-fg shadow-card" : "text-muted",
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
                    className="flex w-full items-center gap-3 rounded-[16px] bg-surface px-4 py-4 text-left shadow-card ring-1 ring-border/80 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <a
        href={localePath(`/daycare/${daycare.slug}`, locale)}
        data-ke="host-view-fab"
        className="fixed bottom-6 left-1/2 z-30 hidden min-h-11 -translate-x-1/2 items-center rounded-full bg-[#11151C] px-5 text-sm font-semibold text-white shadow-lg touch-manipulation md:inline-flex"
      >
        {locale === "fr" ? "Voir" : "View"}
      </a>
    </div>
  );
}
