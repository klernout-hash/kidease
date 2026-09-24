import { createFileRoute, Link, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { MapPinned, MessageCircle, Star } from "lucide-react";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { ShareListingButton } from "@/components/share-button";
import { FreeListingShareActions } from "@/components/free-listing-share";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { ListingHeroGallery } from "@/components/listing-hero-gallery";
import { ListingRail } from "@/components/listing-rail";
import { RequestSpotSheet } from "@/components/request-spot";
import { RequestTourSheet } from "@/components/request-tour";
import { RequestInfoSheet } from "@/components/request-info";
import { RequestMessageSheet } from "@/components/request-message";
import { ListingTourTimes } from "@/components/listing-tour-times";
import {
  ListingHeaderPills,
  ListingJumpNav,
  ListingProgramsTable,
  ListingSnapshotGrid,
} from "@/components/listing-parent-pack";
import { WaitlistOptIn } from "@/components/waitlist-opt-in";
import { GoogleRating } from "@/components/google-rating";
import { BuildingPhoto, ListingPhotoFallback } from "@/components/building-photo";
import { JsonLd } from "@/components/json-ld";
import { LISTING_PLACEHOLDER, classifyListingPhotos, isOfficialBuildingPhoto, primaryListingPhoto } from "@/lib/listing-photo";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { DETAIL_SIZES, HERO_WIDTHS, photoSrcSet, photoUrl } from "@/lib/photo";
import { Button } from "@/components/ui/button";
import { getDaycare, getListingSeo } from "@/lib/server/daycares";
import { cityHubCityName, cityHubDefForPlace } from "@/lib/city-hubs";
import {
  listingBreadcrumbJsonLdScript,
  listingCanonicalUrl,
  listingJsonLdScript,
  listingPageTitle as listingSeoPageTitle,
  listingSeoHeadTags,
} from "@/lib/listing-seo";
import { ListingCultureCard } from "@/components/listing-culture-card";
import { SaveListingButton } from "@/components/save-listing-button";
import { KidEaseApprovalStrip } from "@/components/kidease-approval";
import { publicApprovalEligible, showPublicClaimPrompt } from "@/lib/approve-live";
import { amenityLabel } from "@/lib/amenities";
import { licenseRecordUrl, subsidyEstimatorUrl, cwelccKind, officialLicenceNumber } from "@/lib/licensing";
import { publicLicenseBadge } from "@/lib/license-verify";
import { TrustBadge } from "@/components/trust-badge";
import { ListingReport } from "@/components/listing-report";
import type { CopyKey } from "@/lib/copy";
import { hasCompare, toggleCompareItem } from "@/lib/compare";
import { ListingMoreActions, ListingMoreItem } from "@/components/listing-more-actions";
import { capturePostHogEvent } from "@/lib/posthog";
import { liveLookingOnly } from "@/lib/now-loops";
import { MIN_REVIEW_COUNT } from "@/lib/quality";
import { rememberViewed } from "@/lib/recent";
import { trackLocation } from "@/lib/telemetry";
import { useAppStore } from "@/lib/store";
import { parentMatchScore } from "@/lib/parent-match";
import { parentUrgencyScore } from "@/lib/parent-urgency";
import { distanceKm } from "@/lib/proximity";
import { ListingBadges } from "@/components/listing-badges";
import { CompletenessBanner } from "@/components/listing-completeness";
import { ListingReviewForm } from "@/components/listing-review-form";
import { VacancyFreshness } from "@/components/vacancy-freshness";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { CompareBar } from "@/components/compare-bar";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { listingPageTitle } from "@/lib/listing-meta";
import { listingNotFoundHead, shouldNotFoundListing } from "@/lib/listing-not-found";
import { ListingNotFoundPage } from "@/components/page-not-found";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { classifyFacilityType, type FacilityType } from "@/lib/facility-type";
import { listingAgeRangeText } from "@/lib/listing-ages";
import { formatMonth, money, displayCentreName } from "@/lib/utils";
import { openDirections } from "@/lib/maps";
import { googleReviewsUrl } from "@/lib/google-reviews";
import { ListingMap } from "@/components/listing-map";
import type { AvailabilityRow, Daycare, DaycareCard as Card, Review } from "@/lib/types";
import { parseListingAsk, type ListingAsk } from "@/lib/lead-requests";

export const Route = createFileRoute("/daycare/$slug")({
  validateSearch: (s: Record<string, unknown>) => {
    const ask = parseListingAsk(s.ask);
    return ask ? { ask } : {};
  },
  loader: async ({ params }) => {
    try {
      const seo = await getListingSeo({ data: params.slug });
      if (seo?.slug && seo.slug !== params.slug) {
        throw redirect({
          to: "/daycare/$slug",
          params: { slug: seo.slug },
        });
      }
      if (shouldNotFoundListing(seo)) throw notFound();
      return seo;
    } catch (error) {
      if (error && typeof error === "object" && ("isRedirect" in error || "isNotFound" in error)) {
        throw error;
      }
      throw notFound();
    }
  },
  notFoundComponent: ListingNotFoundPage,
  head: ({ loaderData }) => {
    if (!loaderData) return listingNotFoundHead();
    const canonical = listingCanonicalUrl(loaderData.slug);
    const jsonLd = listingJsonLdScript(loaderData);
    const crumbs = listingBreadcrumbJsonLdScript(loaderData);
    const hero = primaryListingPhoto(loaderData.photos);
    const image = hero
      ? [
          {
            rel: "preload" as const,
            as: "image" as const,
            href: photoUrl(hero, 768),
            imageSrcSet: photoSrcSet(hero, HERO_WIDTHS),
            imageSizes: DETAIL_SIZES,
            fetchPriority: "high" as const,
          },
        ]
      : [];
    return {
      meta: listingSeoHeadTags(loaderData),
      links: [...(canonical ? [{ rel: "canonical", href: canonical }] : []), ...image],
      scripts: [
        ...(jsonLd ? [{ type: "application/ld+json", children: jsonLd }] : []),
        ...(crumbs ? [{ type: "application/ld+json", children: crumbs }] : []),
      ],
    };
  },
  component: Listing,
});

function ListingJsonLd({
  src,
  locale,
}: {
  src: Parameters<typeof listingJsonLdScript>[0] | null | undefined;
  locale: "en" | "fr";
}) {
  const json = src ? listingJsonLdScript(src, locale) : "";
  if (!json) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

function Listing() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const seo = Route.useLoaderData();
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<{
    daycare: Daycare;
    reviews: Review[];
    availability: AvailabilityRow[];
    nearby: Card[];
  } | null>(null);
  const [photo, setPhoto] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [reload, setReload] = useState(0);
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const ageGroup = useAppStore((s) => s.ageGroup);

  useEffect(() => {
    let live = true;
    setMissing(false);
    setData(null);
    const watchdog = window.setTimeout(() => {
      if (!live) return;
      setData((cur) => {
        if (cur) return cur;
        setMissing(true);
        return cur;
      });
    }, 12_000);
    void getDaycare({ data: slug })
      .then((res) => {
        if (!live) return;
        if (!res) setMissing(true);
        else {
          setMissing(false);
          setData(res);
        }
      })
      .catch(() => {
        if (live) setMissing(true);
      });
    return () => {
      live = false;
      window.clearTimeout(watchdog);
    };
  }, [slug, reload]);

  useEffect(() => {
    if (!data) return;
    const id = data.daycare.id;
    function sync() {
      setComparing(hasCompare(id, data?.daycare.slug));
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    return () => window.removeEventListener("kidease-compare", sync);
  }, [data]);

  useEffect(() => {
    if (!data || isPending) return;
    const ask = search.ask;
    if (!ask) return;
    if (ask === "info") {
      setInfoOpen(true);
      return;
    }
    if (ask === "tour") {
      setTourOpen(true);
      return;
    }
    if (!user) {
      goLogin("guestSignInReturn", ask);
      return;
    }
    if (ask === "spot") setRequestOpen(true);
    if (ask === "waitlist") {
      window.setTimeout(() => {
        document.getElementById("waitlist-opt-in")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    }
  }, [data, user, isPending, search.ask]);

  useEffect(() => {
    if (!data) return;
    const d = data.daycare;
    const spots = d.spotsInfant + d.spotsToddler + d.spotsPreschool;
    const prices = [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly].filter((n): n is number => n != null && n > 0);
    rememberViewed({
      ...d,
      distanceKm: 0,
      spotsTotal: spots,
      fromPrice: prices.length ? Math.min(...prices) : 0,
    });
    const origin = useAppStore.getState().origin;
    trackLocation("view", origin.lat, origin.lng, origin.label, { slug: d.slug });
    captureMarketplaceFunnel({ step: "listing_view", source: "listing", dest_path: "/daycare" });
    document.title = listingSeoPageTitle(d, locale === "fr" ? "fr" : "en") || listingPageTitle(d);
  }, [data, locale]);

  const seoLocale = locale === "fr" ? "fr" : "en";
  const jsonLdSrc = data?.daycare ?? seo;

  if (missing) {
    return (
      <Shell>
        <ListingJsonLd src={seo} locale={seoLocale} />
        <main className="ke-gutter mx-auto max-w-lg py-16">
          <EmptyState
            title={t("listingMissing")}
            body={t("listingMissingLead")}
            action={t("search")}
            actionTo="/search"
            secondary={t("tryAgain")}
            onSecondary={() => {
              setMissing(false);
              setData(null);
              setReload((n) => n + 1);
            }}
          />
        </main>
      </Shell>
    );
  }

  if (!data) {
    const earlyPhoto = primaryListingPhoto(seo?.photos);
    const earlyReal = earlyPhoto && isRealListingPhoto(earlyPhoto) ? earlyPhoto : "";
    const earlyName = seo ? displayCentreName(locale === "fr" ? seo.nameFr : seo.name) : "";
    return (
      <Shell>
        <ListingJsonLd src={seo} locale={seoLocale} />
        <main className="mx-auto max-w-5xl overflow-x-hidden">
          <div className="lg:ke-gutter lg:pt-4">
            <div className="ke-listing-hero relative lg:overflow-hidden lg:rounded-[14px]" data-empty={earlyReal ? undefined : "true"}>
              {earlyReal ? (
                <BuildingPhoto
                  eager
                  priority
                  src={earlyReal}
                  sizes={DETAIL_SIZES}
                  width={768}
                  height={576}
                  className="size-full object-cover"
                />
              ) : (
                <>
                  <ListingPhotoFallback className="size-full" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted">
                    {t("photoPending")}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="ke-gutter">
            {earlyName ? <h1 className="mt-3 font-display text-[1.75rem] leading-tight md:text-[2rem]">{earlyName}</h1> : null}
            <PageSkeleton hero={false} cards={2} />
          </div>
        </main>
      </Shell>
    );
  }

  const d = data.daycare;
  const km = distanceKm(origin, { lat: d.lat, lng: d.lng });
  const ranked = {
    ...d,
    matchScore: parentMatchScore(
      { ...d, distanceKm: km },
      { ageGroup, radiusKm, distanceKnown: located },
    ),
    urgencyScore: parentUrgencyScore(d, { ageGroup }),
  };
  const name = displayCentreName(locale === "fr" ? d.nameFr : d.name);
  const desc = locale === "fr" ? d.descriptionFr : d.description;
  const hours = locale === "fr" ? d.hoursFr : d.hours;
  const spots = d.spotsInfant + d.spotsToddler + d.spotsPreschool;
  const classified = classifyListingPhotos(d.photos);
  const interiors = classified.interiors;
  const photos = (() => {
    const list = [classified.storefront, ...interiors].filter(Boolean);
    list.sort((a, b) => Number(isOfficialBuildingPhoto(b)) - Number(isOfficialBuildingPhoto(a)));
    return list.length ? list : [LISTING_PLACEHOLDER];
  })();
  const gallery = photos.filter((src) => isRealListingPhoto(src));
  const roomPhotos = interiors.filter((src) => isRealListingPhoto(src));
  const prices = [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly].filter((n): n is number => n != null && n > 0);
  const from = prices.length ? Math.min(...prices) : 0;
  const live = Boolean(d.live);
  const known = Boolean(d.availabilityKnown);
  const licensed = publicLicenseBadge(d);
  const approved = publicApprovalEligible(d);
  const facilityLabel = t(facilityTypeLabelKey(classifyFacilityType(d).type));
  const updatedAt = d.lastVacancyUpdatedAt || d.lastPhotoUpdatedAt;
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
        month: "short",
        day: "numeric",
      })
    : "";
  const agesLabel = listingAgeRangeText(d);
  const mapsQuery = encodeURIComponent(`${d.address}, ${d.city}, ${d.province} ${d.postalCode}`);
  const mapsPlace = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const googleReviewsHref = googleReviewsUrl(d);
  const licenceNo = officialLicenceNumber(d.licenseNumber, d.id);
  const parentRated = (d.parentReviewCount ?? 0) >= MIN_REVIEW_COUNT && (d.parentRatingX10 ?? 0) > 0;
  const googleRated = d.reviewCount > 0 && d.ratingX10 > 0;

  function goLogin(
    reason?: "needSignInTour" | "needSignInSave" | "needSignInMessage" | "guestSignInReturn",
    ask?: ListingAsk,
  ) {
    if (reason) toast.message(t(reason));
    const next =
      ask === "tour"
        ? `/daycare/${slug}?ask=tour`
        : ask === "spot"
          ? `/daycare/${slug}?ask=spot`
          : ask === "waitlist"
            ? `/daycare/${slug}?ask=waitlist`
            : ask === "info"
              ? `/daycare/${slug}?ask=info`
              : `/daycare/${slug}`;
    void navigate({ to: "/login", search: parentLoginSearch(next) });
  }

  function onInfo() {
    if (!live) return;
    captureMarketplaceFunnel({ step: "contact", source: "listing", dest_path: "/daycare", contact: "info" });
    capturePostHogEvent("listing_request_started", { intent: "info" });
    setInfoOpen(true);
  }

  function onRequest() {
    if (!live) return;
    if (!user) {
      goLogin("guestSignInReturn", "spot");
      return;
    }
    captureMarketplaceFunnel({ step: "contact", source: "listing", dest_path: "/daycare", contact: "spot" });
    capturePostHogEvent("listing_request_started", { intent: "spot" });
    setRequestOpen(true);
  }

  function onTour() {
    if (!live) return;
    captureMarketplaceFunnel({ step: "contact", source: "listing", dest_path: "/daycare", contact: "tour" });
    capturePostHogEvent("listing_request_started", { intent: "tour" });
    setTourOpen(true);
  }

  function onMessage() {
    if (!user) {
      goLogin("needSignInMessage");
      return;
    }
    captureMarketplaceFunnel({ step: "contact", source: "listing", dest_path: "/daycare", contact: "message" });
    capturePostHogEvent("listing_request_started", { intent: "message" });
    setMessageOpen(true);
  }

  const waitlisted = known && spots <= 0;
  const offerClaim = showPublicClaimPrompt(d);
  const cityHub = cityHubDefForPlace(d.city, d.province);
  const heroBack = cityHub ? { to: "/daycare/city/$city" as const, city: cityHub.slug } : { to: "/search" as const };

  function ListingOverflowItems() {
    return (
      <>
        {live ? <ListingMoreItem onClick={onTour}>{t("bookTour")}</ListingMoreItem> : null}
        {live ? <ListingMoreItem onClick={onRequest}>{t("requestSpotCta")}</ListingMoreItem> : null}
        {live ? (
          <ListingMoreItem onClick={onMessage}>
            <MessageCircle className="size-4" /> {t("message")}
          </ListingMoreItem>
        ) : null}
        <ListingMoreItem onClick={() => toggleCompareItem({ id: d.id, slug: d.slug })}>
          {comparing ? t("comparing") : t("compareAdd")}
        </ListingMoreItem>
        <ListingMoreItem onClick={() => void openDirections(d.lat, d.lng, name)}>
          <MapPinned className="size-4" /> {t("directions")}
        </ListingMoreItem>
        {offerClaim ? (
          <Link
            to="/claim"
            search={{ q: d.name }}
            role="menuitem"
            className="flex min-h-11 items-center px-3 text-sm font-medium text-fg hover:bg-surface-2"
          >
            {t("claimCtaShort")}
          </Link>
        ) : null}
        <a
          href={licenseRecordUrl(d.province, d.name, d.licenseNumber)}
          target="_blank"
          rel="noreferrer"
          role="menuitem"
          className="flex min-h-11 items-center px-3 text-sm font-medium text-fg hover:bg-surface-2"
        >
          {t("viewLicenceRecord")}
        </a>
        <a
          href={subsidyEstimatorUrl(d.province)}
          target="_blank"
          rel="noreferrer"
          role="menuitem"
          className="flex min-h-11 items-center px-3 text-sm font-medium text-fg hover:bg-surface-2"
        >
          {t("checkSubsidy")}
        </a>
      </>
    );
  }

  function ListingActions() {
    return (
      <>
        {live ? (
          <Button className="rounded-[14px]" data-ke="listing-primary-cta" onClick={onInfo}>
            {t("requestInfo")}
          </Button>
        ) : (
          <Button className="rounded-[14px]" data-ke="listing-primary-cta" asChild>
            <Link to="/search">{t("searchNearby")}</Link>
          </Button>
        )}
        {live ? (
          <Button className="rounded-[14px]" variant="secondary" onClick={onTour}>
            {t("bookTour")}
          </Button>
        ) : (
          <p className="text-xs text-muted">{t("parentRequestNotLive")}</p>
        )}
      </>
    );
  }

  return (
    <Shell>
      <ListingJsonLd src={jsonLdSrc} locale={seoLocale} />
      <JsonLd json={jsonLdSrc ? listingBreadcrumbJsonLdScript(jsonLdSrc, seoLocale) : ""} />
      <article className="ke-dense mx-auto max-w-5xl overflow-x-hidden pb-[calc(8.75rem+env(safe-area-inset-bottom))] lg:pb-10">
        <div className="lg:ke-gutter lg:pt-4">
          <ListingHeroGallery
            photos={gallery}
            index={photo}
            onIndex={setPhoto}
            back={heroBack}
            slug={d.slug}
            name={name}
            daycareId={d.id}
            nextPath={`/daycare/${slug}`}
            photoId={roomPhotos.length ? undefined : "listing-photos"}
          />
        </div>
        <div className="ke-gutter">
        <nav className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-muted">
          <Link to="/" className="ke-crumb hover:text-fg hover:underline">
            KidEase
          </Link>
          {cityHub ? (
            <>
              <span aria-hidden>/</span>
              <Link
                to="/daycare/city/$city"
                params={{ city: cityHub.slug }}
                className="ke-crumb hover:text-fg hover:underline"
              >
                {locale === "fr" ? `Garderies à ${cityHubCityName(cityHub, "fr")}` : `Daycare in ${cityHubCityName(cityHub, "en")}`}
              </Link>
            </>
          ) : (
            <>
              <span aria-hidden>/</span>
              <Link to="/search" className="ke-crumb hover:text-fg hover:underline">
                {t("backToExplore")}
              </Link>
            </>
          )}
          <span aria-hidden>/</span>
          <span className="text-fg">{name}</span>
        </nav>
        <header className="mt-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-[1.75rem] leading-tight md:text-[2rem]">{name}</h1>
            {gallery.length ? null : (
              <ShareListingButton slug={d.slug} name={name} appearance="icon" className="shrink-0" />
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {d.city}, {d.province}
          </p>
          {(locale === "fr" ? d.taglineFr : d.tagline)?.trim() ? (
            <p className="mt-0.5 text-sm text-muted">{locale === "fr" ? d.taglineFr : d.tagline}</p>
          ) : null}
          {approved || licensed || licenceNo ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-ke="listing-trust-line">
              {approved ? (
                <KidEaseApprovalStrip eligible={publicApprovalEligible(d)} variant="inline" />
              ) : licensed ? (
                <TrustBadge badge={licensed} compact />
              ) : null}
              {licenceNo ? (
                <span className="text-muted">
                  {t("license")} {licenceNo}
                </span>
              ) : null}
            </p>
          ) : null}
          {parentRated ? (
            <a href="#listing-reviews" className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm">
              <Star className="size-3.5 fill-current" />
              <span className="font-semibold tabular-nums">{((d.parentRatingX10 ?? 0) / 10).toFixed(1)}</span>
              <span className="text-muted">
                · {d.parentReviewCount} {t("reviews")}
              </span>
            </a>
          ) : googleRated ? (
            <div className="mt-1">
              <GoogleRating item={d} ratingX10={d.ratingX10} reviewCount={d.reviewCount} compact />
            </div>
          ) : null}
          <ListingHeaderPills item={d} agesLabel={agesLabel} hours={hours} feeFrom={from} />
          <ListingBadges item={ranked} compact feeOnly />
        </header>
        <ListingJumpNav />
        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,20rem)]">
        <div id="listing-overview" className="ke-listing-sections min-w-0 scroll-mt-24">
            {!live && d.claimStatus && d.claimStatus !== "unclaimed" ? (
              <ListingStatusBadge claimStatus={d.claimStatus} live={live} />
            ) : null}
            <CompletenessBanner item={d} />
            {!live ? (
              <p className="text-sm text-muted">
                {t("unclaimedNotice")}{" "}
                <Link
                  to="/verify"
                  hash="unclaimed"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("unclaimedWhatMeans")}
                </Link>
              </p>
            ) : null}
            {offerClaim ? (
              <p className="text-sm" data-ke="listing-claim-prompt">
                {t("isThisYours")}{" "}
                <Link to="/claim" search={{ q: d.name }} className="text-primary underline-offset-4 hover:underline">
                  {t("claimThisFreePage")}
                </Link>
              </p>
            ) : null}

            {(desc || "").trim() ? (
              <section>
                <h2 className="font-display text-2xl">{t("about")}</h2>
                <p className="mt-2 max-w-prose text-muted">{desc}</p>
              </section>
            ) : null}

            <ListingProgramsTable item={d} />

            <section id="listing-fees" className="scroll-mt-24">
              <h2 className="font-display text-2xl">{t("pricing")}</h2>
              {live && from > 0 ? (
                <ul className="mt-3 divide-y divide-border">
                  {d.infantMonthly != null ? (
                    <PriceRow label={t("infantFee")} value={money(d.infantMonthly, locale)} extra={`${d.spotsInfant} ${t("spots")}`} />
                  ) : null}
                  {d.toddlerMonthly != null ? (
                    <PriceRow label={t("toddlerFee")} value={money(d.toddlerMonthly, locale)} extra={`${d.spotsToddler} ${t("spots")}`} />
                  ) : null}
                  {d.preschoolMonthly != null ? (
                    <PriceRow label={t("preschoolFee")} value={money(d.preschoolMonthly, locale)} extra={`${d.spotsPreschool} ${t("spots")}`} />
                  ) : null}
                  {d.partTimeMonthly != null ? (
                    <PriceRow label={t("partTime")} value={money(d.partTimeMonthly, locale)} extra="" />
                  ) : null}
                </ul>
              ) : (
                <p className="mt-2 max-w-prose text-sm text-muted">{t("feeUnknownLead")}</p>
              )}
              <p className="mt-3 text-sm">
                <Link to="/benefits" className="font-medium text-primary underline-offset-4 hover:underline">
                  {t("benefitsTab")}
                </Link>
                <span className="text-muted"> — {t("aidOnListing")}</span>
              </p>
            </section>

            <section id="listing-location" className="scroll-mt-24">
              <div className="flex items-end justify-between gap-3">
                <h2 className="font-display text-2xl">{t("onMap")}</h2>
                <button
                  type="button"
                  onClick={() => void openDirections(d.lat, d.lng, name)}
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <MapPinned className="size-4" />
                  {t("directions")}
                </button>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-border">
                <ListingMap lat={d.lat} lng={d.lng} title={`${name} — Google Maps`} />
              </div>
              <p className="mt-3 text-sm text-muted">
                {d.address}, {d.city}, {d.province} {d.postalCode}
              </p>
              <a
                href={mapsPlace}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("openGoogleMaps")}
              </a>
            </section>

            <section id="listing-reviews" className="scroll-mt-24">
              <h2 className="font-display text-2xl">{t("parentReviews")}</h2>
              {(d.parentReviewCount ?? 0) >= MIN_REVIEW_COUNT && (d.parentRatingX10 ?? 0) > 0 ? (
                <p className="mt-2 inline-flex items-center gap-2 text-sm">
                  <Star className="size-3.5 fill-fg" />
                  <span className="font-medium tabular-nums">{((d.parentRatingX10 ?? 0) / 10).toFixed(1)}</span>
                  <span className="text-muted">
                    ({d.parentReviewCount} {t("reviews")})
                  </span>
                </p>
              ) : null}
              {data.reviews.length ? (
                <ul className="mt-3 divide-y divide-border">
                  {data.reviews.map((r) => (
                    <li key={r.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{r.author}</p>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Star className="size-3.5 fill-fg" />
                          {r.rating}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{locale === "fr" ? r.bodyFr : r.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">{t("reviewsEnrolledEmpty")}</p>
              )}
              {googleRated ? (
                <a
                  href={googleReviewsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("viewOnGoogle")}
                </a>
              ) : null}
              <ListingReviewForm daycareId={d.id} slug={d.slug} />
            </section>

            {roomPhotos.length ? (
              <section id="listing-photos" className="scroll-mt-24">
                <h2 className="font-display text-2xl">{t("interiors")}</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {roomPhotos.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setPhoto(gallery.indexOf(src))}
                      className="aspect-[4/3] overflow-hidden rounded-lg bg-surface-2"
                      aria-label={`${t("interiors")} ${i + 1}`}
                    >
                      <BuildingPhoto src={src} className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <ListingTourTimes daycare={d} onBook={onTour} canBook={live} />
            <ListingSnapshotGrid item={d} />

            <section>
              <h2 className="font-display text-2xl">{t("availability")}</h2>
              {known ? (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {data.availability.map((row) => (
                    <li key={row.month} className="py-2.5">
                      <p className="font-medium">{formatMonth(row.month, locale)}</p>
                      <p className="mt-0.5 text-muted tabular-nums">
                        {t("infant")} {row.infant} · {t("toddler")} {row.toddler} · {t("preschool")} {row.preschool}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 max-w-prose text-sm text-muted">{t("availUnknownLead")}</p>
              )}
              <VacancyFreshness item={d} className="mt-2 text-xs text-subtle" lead />
              {live ? (
                <div className="mt-4">
                  <WaitlistOptIn daycareId={d.id} next={`/daycare/${d.slug}`} />
                </div>
              ) : null}
            </section>

            {d.amenities.split(",").filter(Boolean).length ? (
              <section>
                <h2 className="font-display text-2xl">{t("amenities")}</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {d.amenities
                    .split(",")
                    .filter(Boolean)
                    .map((key) => (
                      <li key={key} className="ke-chip-meta">
                        {amenityLabel(key, locale)}
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            <ListingCultureCard daycare={d} />

            <section>
              <h2 className="font-display text-2xl">{t("licenceRecord")}</h2>
              <p className="mt-2 max-w-prose text-sm text-muted">{t("licenceRecordLead")}</p>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Meta label={t("license")} value={officialLicenceNumber(d.licenseNumber, d.id) ?? t("trustNotVerified")} />
                {licensed && !approved ? (
                  <Meta label={t("licenseStatus")} value={t(licensed.labelKey as CopyKey)} />
                ) : null}
                <Meta label={t("facilityType")} value={facilityLabel} />
                <Meta label={t("lastInspection")} value={t("seeOfficialRecord")} />
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <a
                  href={licenseRecordUrl(d.province, d.name, d.licenseNumber)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("viewLicenceRecord")}
                </a>
                <a
                  href={subsidyEstimatorUrl(d.province)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-muted underline-offset-4 hover:underline"
                >
                  {t("checkSubsidy")}
                </a>
                <Link to="/tour-checklist" className="inline-flex min-h-11 items-center text-sm font-medium text-muted underline-offset-4 hover:underline">
                  {t("tourChecklist")}
                </Link>
                <Link to="/verify" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {t("learnMore")}
                </Link>
              </div>
              <p className="mt-2 text-xs text-subtle">
                {cwelccKind(d.province) === "qc" ? t("cwelccQcNote") : t("cwelccAskNote")}
              </p>
              <div className="mt-3">
                <ListingReport daycareId={d.id} centreName={name} />
              </div>
            </section>

            <p className="max-w-prose text-xs leading-5 text-subtle">
              {[
                facilityLabel,
                updatedLabel ? `${t("updatedLabel")} ${updatedLabel}` : "",
                live ? t("liveListingLine") : "",
                t("freeListingNotAd"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
        </div>
        <aside className="ke-panel hidden h-fit px-4 py-4 shadow-card lg:sticky lg:top-20 lg:block">
          <ListingCtaSnippet live={live} from={from} hours={hours} prominent />
          <p className="mt-1 text-sm text-muted">{live ? t("listingCtaLead") : t("guestListingTrust")}</p>
          {!user && live ? <p className="mt-1 text-xs text-subtle">{t("guestBrowse")}</p> : null}
          <div className="mt-3 grid gap-1.5">
            <ListingActions />
            {live && waitlisted ? (
              <WaitlistOptIn daycareId={d.id} next={`/daycare/${d.slug}?ask=waitlist`} />
            ) : null}
            <ListingMoreActions>
              <ListingOverflowItems />
              <div className="px-1 py-1">
                <ShareListingButton slug={d.slug} name={name} appearance="labeled" className="w-full" />
                <FreeListingShareActions slug={d.slug} name={name} lat={d.lat} lng={d.lng} />
              </div>
            </ListingMoreActions>
            <SaveListingButton daycareId={d.id} nextPath={`/daycare/${slug}`} appearance="ghost" />
          </div>
          <p className="mt-3 text-xs text-subtle">{t("privacyNote")}</p>
        </aside>
        </div>

        {data.nearby.length ? (
          <ListingRail title={t("similar")} items={liveLookingOnly(data.nearby)} seeAllHref="/search" className="mt-12 first:mt-12" />
        ) : null}
        </div>
      </article>

      {!requestOpen ? (
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden [[data-channel=app]_&]:bottom-20">
        <div className="mx-auto max-w-lg">
          <ListingCtaSnippet live={live} from={from} hours={hours} />
          <div className="flex items-center gap-2">
          {live ? (
            <>
              <Button className="h-auto min-h-11 flex-1 rounded-[14px] px-2.5 py-2 text-center text-[13px] leading-tight" data-ke="listing-sticky-cta" onClick={onInfo}>
                {t("requestInfo")}
              </Button>
              <Button className="h-auto min-h-11 flex-1 rounded-[14px] px-2.5 py-2 text-center text-[13px] leading-tight" variant="secondary" data-ke="listing-sticky-tour" onClick={onTour}>
                {t("bookTour")}
              </Button>
            </>
          ) : (
            <Button className="h-12 min-h-12 flex-1 rounded-[14px]" data-ke="listing-sticky-cta" asChild>
              <Link to="/search">{t("searchNearbyShort")}</Link>
            </Button>
          )}
          <SaveListingButton daycareId={d.id} nextPath={`/daycare/${slug}`} appearance="bar" className="shrink-0" />
          <ListingMoreActions compact>
            <ListingOverflowItems />
            <div className="px-1 py-1">
              <ShareListingButton slug={d.slug} name={name} appearance="labeled" className="w-full" />
              <FreeListingShareActions slug={d.slug} name={name} lat={d.lat} lng={d.lng} />
            </div>
          </ListingMoreActions>
          </div>
        </div>
      </div>
      ) : null}

      <RequestSpotSheet daycare={d} open={requestOpen} intent="spot" onClose={() => setRequestOpen(false)} />
      <RequestTourSheet
        daycare={d}
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onRequestInfo={() => setInfoOpen(true)}
      />
      <RequestInfoSheet daycare={d} open={infoOpen} onClose={() => setInfoOpen(false)} />
      <RequestMessageSheet daycare={d} open={messageOpen} onClose={() => setMessageOpen(false)} />
      <CompareBar hidden={infoOpen || requestOpen || tourOpen || messageOpen} />
    </Shell>
  );
}

const FACILITY_LABEL: Record<FacilityType, CopyKey> = {
  child_care_centre: "facilityTypeCentre",
  family_home: "facilityTypeHome",
  group_home: "facilityTypeGroupHome",
  nursery_preschool: "facilityTypeNursery",
  school_age: "facilityTypeSchool",
};

function facilityTypeLabelKey(type: FacilityType): CopyKey {
  return FACILITY_LABEL[type];
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="ke-fact">
      <dt className="text-[11px] leading-4 text-muted">{label}</dt>
      <dd className="truncate text-sm font-medium leading-5">{value}</dd>
    </div>
  );
}

function ListingCtaSnippet({
  live,
  from,
  hours,
  prominent = false,
}: {
  live: boolean;
  from: number;
  hours: string;
  prominent?: boolean;
}) {
  const { t, locale } = useCopy();
  const fee = live && from > 0 ? `${t("monthlyFrom")} ${money(from, locale)}${t("month")}` : "";
  const hoursText = hours.trim();
  const showHours = Boolean(hoursText && hoursText !== "—" && hoursText !== "-");
  if (!fee && !showHours) return null;
  return (
    <p className={prominent ? "text-sm leading-5" : "mb-1.5 truncate text-sm leading-5"} data-ke="listing-cta-snippet">
      {fee ? <span className="font-semibold text-fg">{fee}</span> : null}
      {fee && showHours ? <span className="text-muted"> · </span> : null}
      {showHours ? <span className="text-muted">{hoursText}</span> : null}
    </p>
  );
}

function PriceRow({ label, value, extra }: { label: string; value: string; extra: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-1.5">
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">
        {value}
        {extra ? <span className="ml-2 text-xs text-muted">{extra}</span> : null}
      </span>
    </li>
  );
}
