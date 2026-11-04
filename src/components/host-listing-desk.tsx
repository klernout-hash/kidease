import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
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
}: {
  listings: Daycare[];
  onSaved: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
}) {
  const { locale } = useCopy();
  const copy = hostCopy(locale);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = listings.find((row) => row.id === openId) ?? null;

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
                className="w-full overflow-hidden rounded-2xl bg-surface text-left ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => choose(row.id)}
              >
                <BuildingPhoto
                  src={photo}
                  alt={row.name}
                  className="aspect-[4/3] w-full object-cover"
                  width={640}
                  height={480}
                />
                <span className="block px-4 py-3">
                  <span className="block font-display text-xl">{row.name}</span>
                  <span className="mt-1 block text-sm text-muted">{row.city}</span>
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

function HostEditor({
  daycare,
  onBack,
  onSaved,
}: {
  daycare: Daycare;
  onBack: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t, locale } = useCopy();
  const copy = hostCopy(locale);
  const [tab, setTab] = useState<"centre" | "guide">("centre");
  const [section, setSection] = useState<HostSection | null>(null);
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

  if (section) {
    return (
      <div data-ke="host-section" data-section={section}>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center gap-1 text-sm font-medium touch-manipulation"
          onClick={() => setSection(null)}
        >
          <ChevronLeft className="size-5" aria-hidden />
          {t("back")}
        </button>
        <h2 className="mt-2 font-display text-2xl">{sectionTitle(section, locale)}</h2>
        <CapacityForm
          daycare={daycare}
          mode="listing"
          focus={section}
          guide={guide}
          onGuide={saveGuide}
          onSaved={() => void onSaved()}
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

  const sections = tab === "centre" ? CENTRE_SECTIONS : GUIDE_SECTIONS;

  return (
    <div data-ke="host-editor">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center touch-manipulation"
          aria-label={t("back")}
          onClick={onBack}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h2 className="font-display text-xl">{copy.editor}</h2>
      </div>
      <div role="tablist" aria-label={copy.editor} className="mt-3 inline-flex max-w-full rounded-full bg-bg p-1 ring-1 ring-border">
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
              "min-h-11 rounded-full px-4 text-sm font-medium touch-manipulation",
              tab === id ? "bg-fg text-bg" : "text-fg",
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {sections.map((id) => (
          <li key={id}>
            <button
              type="button"
              data-ke="host-section-card"
              data-section={id}
              className="w-full rounded-2xl bg-surface px-4 py-3 text-left ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSection(id)}
            >
              <span className="block font-medium">{sectionTitle(id, locale)}</span>
              <span className="mt-1 block text-sm text-muted">{sectionSummary(id, daycare, locale, guide)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
