import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Heart, MapPinned, MessageCircle, Phone, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { DaycareCard } from "@/components/daycare-card";
import { RequestSpotSheet } from "@/components/request-spot";
import { GoogleRating } from "@/components/google-rating";
import { BuildingPhoto } from "@/components/building-photo";
import { LISTING_PLACEHOLDER, isOfficialBuildingPhoto } from "@/lib/listing-photo";
import { Button } from "@/components/ui/button";
import { getDaycare } from "@/lib/server/daycares";
import { isSaved, openConversation, toggleSave } from "@/lib/server/family";
import { amenityLabel } from "@/lib/amenities";
import { licenseRecordUrl, subsidyEstimatorUrl, cwelccKind } from "@/lib/licensing";
import { readCompare, toggleCompare } from "@/lib/compare";
import { rememberViewed } from "@/lib/recent";
import { trackLocation } from "@/lib/telemetry";
import { useAppStore } from "@/lib/store";
import { ListingBadges } from "@/components/listing-badges";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { CompareBar } from "@/components/compare-bar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { formatMonth, money, formatAgeRange, displayCentreName } from "@/lib/utils";
import { ListingContact } from "@/components/listing-contact";
import { openDirections } from "@/lib/maps";
import { googleReviewsUrl } from "@/lib/google-reviews";
import type { AvailabilityRow, Daycare, DaycareCard as Card, Review } from "@/lib/types";

export const Route = createFileRoute("/daycare/$slug")({ component: Listing });

function Listing() {
  const { slug } = Route.useParams();
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<{
    daycare: Daycare;
    reviews: Review[];
    availability: AvailabilityRow[];
    nearby: Card[];
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    setMissing(false);
    setData(null);
    void getDaycare({ data: slug })
      .then((res) => {
        if (!live) return;
        if (!res) setMissing(true);
        else setData(res);
      })
      .catch(() => {
        if (live) setMissing(true);
      });
    return () => {
      live = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!data) return;
    const id = data.daycare.id;
    function sync() {
      setComparing(readCompare().includes(id));
    }
    sync();
    window.addEventListener("kidease-compare", sync);
    return () => window.removeEventListener("kidease-compare", sync);
  }, [data]);

  useEffect(() => {
    if (!data || isPending || !user) return;
    void isSaved({ data: data.daycare.id })
      .then((r) => setSaved(r.saved))
      .catch(() => setSaved(false));
  }, [data, user, isPending]);

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
  }, [data]);

  if (missing) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-lg py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This listing is not available.</p>
          <Link to="/search" className="mt-6 inline-flex text-sm text-primary underline-offset-4 hover:underline">
            {t("search")}
          </Link>
        </main>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="ke-gutter mx-auto max-w-5xl py-10">
          <div className="aspect-[16/9] animate-pulse rounded-xl bg-surface-2" />
        </div>
      </Shell>
    );
  }

  const d = data.daycare;
  const name = displayCentreName(locale === "fr" ? d.nameFr : d.name);
  const desc = locale === "fr" ? d.descriptionFr : d.description;
  const hours = locale === "fr" ? d.hoursFr : d.hours;
  const spots = d.spotsInfant + d.spotsToddler + d.spotsPreschool;
  const photos = (() => {
    const list = [...d.photos].filter(Boolean);
    list.sort((a, b) => Number(isOfficialBuildingPhoto(b)) - Number(isOfficialBuildingPhoto(a)));
    return list.length ? list : [LISTING_PLACEHOLDER];
  })();
  const prices = [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly].filter((n): n is number => n != null && n > 0);
  const from = prices.length ? Math.min(...prices) : 0;
  const live = Boolean(d.live);
  const known = Boolean(d.availabilityKnown || live);
  const mapsQuery = encodeURIComponent(`${d.address}, ${d.city}, ${d.province} ${d.postalCode}`);
  const mapsEmbed = `https://maps.google.com/maps?q=${d.lat},${d.lng}&z=16&output=embed`;
  const mapsDir = `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
  const mapsPlace = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const googleReviewsHref = googleReviewsUrl(d);

  function onRequest() {
    if (!live) return;
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    setRequestOpen(true);
  }

  function onTour() {
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    setTourOpen(true);
  }

  async function onSave() {
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    try {
      const res = await toggleSave({ data: d.id });
      setSaved(res.saved);
    } catch {
      void navigate({ to: "/login" });
    }
  }

  async function onMessage() {
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    try {
      const res = await openConversation({ data: d.id });
      void navigate({ to: "/inbox/$id", params: { id: res.id } });
    } catch {
      toast.error(t("needSignIn"));
      void navigate({ to: "/login" });
    }
  }

  return (
    <Shell>
      <article className="ke-gutter mx-auto max-w-5xl overflow-x-hidden py-6 pb-28 md:pb-10">
        <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
          <div className="relative aspect-[16/10] bg-surface-2 md:aspect-[2/1]">
            {photos[photo]?.includes("-logo") ? (
              <img
                src={photos[photo]}
                alt=""
                className="size-full object-contain bg-surface p-10"
              />
            ) : (
              <BuildingPhoto eager src={photos[photo] ?? "/photos/storefront-placeholder.jpg"} sizes="(max-width: 767px) 100vw, 720px" width={768} height={576} className="size-full object-cover" />
            )}
            {photos.length > 1 ? (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => setPhoto(i)}
                    className={i === photo ? "size-2 rounded-full bg-surface" : "size-2 rounded-full bg-surface/50"}
                  />
                ))}
              </div>
            ) : null}
          </div>
          {photos.length > 1 ? (
            <div className="grid grid-cols-4 gap-1 p-1">
              {photos.slice(0, 4).map((src, i) => (
                <button key={src} type="button" onClick={() => setPhoto(i)} className="aspect-[4/3] overflow-hidden bg-surface-2">
                  <BuildingPhoto
                    src={src}
                    className={src.includes("-logo") ? "size-full object-contain p-2" : "size-full object-cover"}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">
                  {d.address}, {d.city}, {d.province} {d.postalCode}
                </p>
                <h1 className="mt-1 font-display text-3xl md:text-4xl">{name}</h1>
                <p className="mt-2 text-muted">{locale === "fr" ? d.taglineFr : d.tagline}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!live && d.claimStatus && d.claimStatus !== "unclaimed" ? (
                    <ListingStatusBadge claimStatus={d.claimStatus} live={live} />
                  ) : null}
                  <ListingBadges item={d} />
                </div>
                <p className="mt-3 text-sm text-muted">{t("licensedCentreLine")}</p>
                {live ? <p className="text-sm text-muted">{t("liveListingLine")}</p> : null}
                {!live ? (
                  <div className="mt-3 space-y-2 rounded-lg bg-surface p-3 text-sm text-muted ring-1 ring-border">
                    <p>{t("unclaimedNotice")}</p>
                    <ListingContact name={name} slug={d.slug} city={d.city} />
                  </div>
                ) : null}
                {!d.claimed ? (
                  <p className="mt-3 text-sm">
                    {t("isThisYours")}{" "}
                    <Link to="/claim" search={{ q: d.name }} className="text-primary underline-offset-4 hover:underline">
                      {t("claimCta")}
                    </Link>
                  </p>
                ) : null}
              </div>
              {d.reviewCount > 0 && d.ratingX10 > 0 ? (
                <div className="space-y-1">
                  <GoogleRating item={d} ratingX10={d.ratingX10} reviewCount={d.reviewCount} />
                  <a
                    href={googleReviewsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-primary underline-offset-4 hover:underline"
                  >
                    {t("viewOnGoogle")}
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted">{t("licensed")}</p>
              )}
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Meta label={t("hours")} value={hours} />
              <Meta label={t("ages")} value={d.agesKnown ? formatAgeRange(d.ageMinMonths, d.ageMaxMonths) : t("agesUnknown")} />
              <Meta label={t("license")} value={d.licenseNumber ?? "—"} />
              <Meta
                label={t("spotsAvailable")}
                value={known ? (spots > 0 ? `${spots}` : t("waitlist")) : t("availUnknown")}
              />
            </dl>

            <section className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border">
              <h2 className="text-2xl">{t("licenceRecord")}</h2>
              <p className="mt-2 text-sm text-muted">{t("licenceRecordLead")}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Meta label={t("license")} value={d.licenseNumber ?? "—"} />
                <Meta label={t("licenseStatus")} value={t("licenseActive")} />
                <Meta label={t("lastInspection")} value={t("seeOfficialRecord")} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <a href={licenseRecordUrl(d.province, d.name, d.licenseNumber)} target="_blank" rel="noreferrer">
                    {t("viewLicenceRecord")}
                  </a>
                </Button>
                <Button asChild variant="ghost">
                  <a href={subsidyEstimatorUrl(d.province)} target="_blank" rel="noreferrer">
                    {t("checkSubsidy")}
                  </a>
                </Button>
                <Button type="button" variant="ghost" onClick={() => toggleCompare(d.id)}>
                  {comparing ? t("comparing") : t("addToCompare")}
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/tour-checklist">{t("tourChecklist")}</Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-subtle">
                {cwelccKind(d.province) === "qc" ? t("cwelccQcNote") : t("cwelccAskNote")}
              </p>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">{t("about")}</h2>
              <p className="mt-2 max-w-prose text-muted">{desc}</p>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">{t("pricing")}</h2>
              {live && from > 0 ? (
                <ul className="mt-3 divide-y divide-border rounded-lg ring-1 ring-border">
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
                <p className="mt-3 rounded-lg bg-surface p-4 text-sm text-muted ring-1 ring-border">{t("feeUnknownLead")}</p>
              )}
              <p className="mt-3 text-sm">
                <Link to="/benefits" className="font-medium text-primary underline-offset-4 hover:underline">
                  {t("benefitsTab")}
                </Link>
                <span className="text-muted"> — {t("aidOnListing")}</span>
              </p>
            </section>

            <section className="mt-8">
              <div className="flex items-end justify-between gap-3">
                <h2 className="font-display text-2xl">{t("onMap")}</h2>
                <button
                  type="button"
                  onClick={() => void openDirections(d.lat, d.lng, name)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <MapPinned className="size-4" />
                  {t("directions")}
                </button>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-border">
                <iframe
                  title={`${name} — Google Maps`}
                  src={mapsEmbed}
                  className="h-64 w-full border-0 md:h-80"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void openDirections(d.lat, d.lng, name)}>
                  {t("directions")}
                </Button>
                <Button asChild variant="secondary">
                  <a href={mapsPlace} target="_blank" rel="noreferrer">
                    {t("openGoogleMaps")}
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-sm text-muted">
                {d.address}, {d.city}, {d.province} {d.postalCode}
              </p>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">{t("availability")}</h2>
              {known ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {data.availability.map((row) => (
                    <div key={row.month} className="rounded-lg bg-surface p-3 text-sm ring-1 ring-border">
                      <p className="font-medium">{formatMonth(row.month, locale)}</p>
                      <p className="mt-1 text-muted tabular-nums">
                        {t("infant")} {row.infant} · {t("toddler")} {row.toddler} · {t("preschool")} {row.preschool}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-surface p-4 text-sm text-muted ring-1 ring-border">{t("availUnknownLead")}</p>
              )}
              {live && d.spotsUpdatedAt ? (
                <p className="mt-2 text-xs text-subtle">{t("spotsUpdated")} {d.spotsUpdatedAt.slice(0, 10)}</p>
              ) : null}
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">{t("amenities")}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {d.amenities
                  .split(",")
                  .filter(Boolean)
                  .map((key) => (
                    <li key={key} className="rounded-full bg-surface px-3 py-1 text-sm ring-1 ring-border">
                      {amenityLabel(key, locale)}
                    </li>
                  ))}
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">{t("parentReviews")}</h2>
              {data.reviews.length ? (
                <ul className="mt-3 space-y-4">
                  {data.reviews.map((r) => (
                    <li key={r.id} className="rounded-lg bg-surface p-4 ring-1 ring-border">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{r.author}</p>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Star className="size-3.5 fill-fg" />
                          {r.rating}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted">{locale === "fr" ? r.bodyFr : r.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">{t("noReviews")}</p>
              )}
            </section>
          </div>

          <aside className="hidden h-fit rounded-xl bg-surface p-6 shadow-lift ring-1 ring-border lg:sticky lg:top-20 lg:block">
            <p className="text-sm text-muted">{t("monthlyFrom")}</p>
            <p className="font-display text-3xl tabular-nums">
              {from > 0 ? (
                <>
                  {money(from, locale)}
                  <span className="text-base text-muted">{t("month")}</span>
                </>
              ) : (
                <span className="text-xl">{t("feeUnknown")}</span>
              )}
            </p>
            <div className="mt-4 grid gap-2">
              {live ? (
                <Button onClick={onTour}>{t("bookTour")}</Button>
              ) : (
                <Button disabled>{t("requestUnavailable")}</Button>
              )}
              {live ? (
                <Button variant="secondary" onClick={onRequest}>{t("book")}</Button>
              ) : (
                <Button disabled variant="secondary">{t("notOnKidEase")}</Button>
              )}
              {live ? (
                <Button variant="secondary" onClick={() => void onMessage()}>
                  <MessageCircle className="size-4" /> {t("message")}
                </Button>
              ) : (
                <p className="text-xs text-muted">{t("requestUnavailable")}</p>
              )}
              <ListingContact name={name} slug={d.slug} city={d.city} className="justify-center" />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="ghost" onClick={() => void onSave()} aria-label={t("save")}>
                  <Heart className={saved ? "size-4 fill-fg" : "size-4"} />
                </Button>
                {d.phone ? (
                  <Button variant="ghost" asChild>
                    <a href={`tel:${d.phone}`} aria-label={t("call")}>
                      <Phone className="size-4" />
                    </a>
                  </Button>
                ) : (
                  <Button variant="ghost" disabled aria-label={t("call")}>
                    <Phone className="size-4" />
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <a href={mapsDir} target="_blank" rel="noreferrer" aria-label={t("directions")}>
                    <MapPinned className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-subtle">{t("privacyNote")}</p>
          </aside>
        </div>

        {data.nearby.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl">{t("similar")}</h2>
            <div className="ke-listings mt-4">
              {data.nearby.map((item) => (
                <DaycareCard key={item.id} item={item} showDistance={false} />
              ))}
            </div>
          </section>
        ) : null}
      </article>

      {!requestOpen ? (
      <div className="fixed inset-x-0 bottom-20 z-20 border-t border-border bg-surface/95 px-3 py-2 backdrop-blur-md [[data-channel=website]_&]:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          {live ? (
            <Button className="flex-1" variant="secondary" onClick={onTour}>
              {t("bookTour")}
            </Button>
          ) : null}
          {live ? (
            <Button className="flex-1" onClick={onRequest}>
              {t("book")}
            </Button>
          ) : null}
          {live ? (
            <Button variant="secondary" size="icon" onClick={() => void onMessage()} aria-label={t("message")}>
              <MessageCircle className="size-5" />
            </Button>
          ) : null}
          {d.phone ? (
            <Button variant="secondary" size="icon" asChild>
              <a href={`tel:${d.phone}`} aria-label={t("call")}>
                <Phone className="size-5" />
              </a>
            </Button>
          ) : null}
          <Button variant="secondary" size="icon" asChild>
            <a href={mapsDir} target="_blank" rel="noreferrer" aria-label={t("directions")}>
              <MapPinned className="size-5" />
            </a>
          </Button>
        </div>
      </div>
      ) : null}

      <RequestSpotSheet daycare={d} open={requestOpen} intent="spot" onClose={() => setRequestOpen(false)} />
      <RequestSpotSheet daycare={d} open={tourOpen} intent="tour" onClose={() => setTourOpen(false)} />
      <CompareBar />
    </Shell>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface p-3 ring-1 ring-border">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function PriceRow({ label, value, extra }: { label: string; value: string; extra: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">
        {value}
        {extra ? <span className="ml-2 text-xs text-muted">{extra}</span> : null}
      </span>
    </li>
  );
}
