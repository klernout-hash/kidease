import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { QcAreaMap } from "@/components/qc-area-map";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { revealQcHomeContact, submitQcHomeRequest } from "@/lib/server/qc-home-daycares";
import { qcHomeCopy, type QcHomeLocale, type QcHomePublicListing } from "@/lib/qc-home-daycare";

function focusIn(event: { currentTarget: HTMLElement }) {
  event.currentTarget.scrollIntoView({ block: "center" });
}

export function QcHomeListing({
  locale,
  enabled,
  listing,
  error,
}: {
  locale: QcHomeLocale;
  enabled: boolean;
  listing: QcHomePublicListing | null;
  error: boolean;
}) {
  const copy = qcHomeCopy(locale);
  const fr = locale === "fr";
  const [phone, setPhone] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [kind, setKind] = useState<"correction" | "removal">("correction");
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { token, onToken, required: turnstileRequired } = useTurnstileToken();

  async function reveal(channel: "phone" | "email") {
    if (!listing) return;
    setRevealError(null);
    if (channel === "phone" && phone != null) {
      setPhone(null);
      return;
    }
    if (channel === "email" && email != null) {
      setEmail(null);
      return;
    }
    try {
      const result = await revealQcHomeContact({ data: { slug: listing.slug, channel } });
      if (channel === "phone") setPhone(result.value || "");
      else setEmail(result.value || "");
    } catch {
      setRevealError(copy.revealError);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!listing) return;
    if (turnstileRequired && !token.trim()) {
      setFormError(copy.formError);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await submitQcHomeRequest({
        data: {
          slug: listing.slug,
          kind,
          name,
          email: contactEmail,
          message,
          turnstileToken: token,
        },
      });
      setSaved(true);
    } catch {
      setFormError(copy.formError);
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <Shell>
        <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-8">
          <h1 className="font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">{copy.closedTitle}</h1>
          <p className="mt-3 max-w-prose text-base leading-6">{copy.closedLead}</p>
          <div className="mt-6">
            <Button asChild>
              {fr ? <Link to="/fr/search">{copy.closedButton}</Link> : <Link to="/search">{copy.closedButton}</Link>}
            </Button>
          </div>
        </main>
      </Shell>
    );
  }

  if (!listing) {
    return (
      <Shell>
        <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-8">
          <h1 className="font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">{copy.notFoundTitle}</h1>
          <p className="mt-3 text-base leading-6">{error ? copy.loadError : copy.notFoundBody}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              {fr ? (
                <Link to="/fr/milieux-familiaux" search={{ q: "" }}>
                  {copy.emptySearch}
                </Link>
              ) : (
                <Link to="/milieux-familiaux" search={{ q: "" }}>
                  {copy.emptySearch}
                </Link>
              )}
            </Button>
            <Button asChild variant="secondary">
              {fr ? <Link to="/fr">{copy.home}</Link> : <Link to="/">{copy.home}</Link>}
            </Button>
          </div>
        </main>
      </Shell>
    );
  }

  const place = listing.municipality || listing.neighbourhood || listing.postalFsa || listing.locationLabel;
  const primaryChannel = listing.hasPhone ? "phone" : listing.hasEmail ? "email" : null;

  return (
    <Shell>
      <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-8">
        <p className="text-sm font-medium text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">{listing.displayName}</h1>
        <p className="mt-3 max-w-prose text-base leading-6">
          {locale === "fr"
            ? "KidEase est une entreprise canadienne. Cette fiche est un milieu familial reconnu. Vous voyez le secteur, pas le domicile."
            : "KidEase is a Canadian company. This is a recognized home daycare. You see the area, not the home."}
        </p>
        {listing.sample ? (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm" role="note">
            {copy.sample}
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <img src="/logo-transparent.svg?v=17" alt="" width={48} height={48} className="h-12 w-12 object-contain" />
          {listing.locationLabel ? <p className="text-base leading-6">{listing.locationLabel}</p> : null}
        </div>
        {listing.sourceUrl ? (
          <p className="mt-4">
            <a
              href={listing.sourceUrl}
              className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              rel="noopener noreferrer"
              target="_blank"
            >
              {listing.badgeText}
            </a>
          </p>
        ) : (
          <p className="mt-4 font-medium">{listing.badgeText}</p>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {listing.hasPhone ? (
            <Button type="button" variant={primaryChannel === "phone" ? "primary" : "secondary"} onClick={() => void reveal("phone")}>
              {phone == null ? copy.showPhone : copy.hidePhone}
            </Button>
          ) : null}
          {listing.hasEmail ? (
            <Button type="button" variant={primaryChannel === "email" ? "primary" : "secondary"} onClick={() => void reveal("email")}>
              {email == null ? copy.showEmail : copy.hideEmail}
            </Button>
          ) : null}
          {!listing.hasPhone && !listing.hasEmail && listing.sourceUrl ? (
            <Button asChild>
              <a href={listing.sourceUrl} rel="noopener noreferrer" target="_blank">
                {listing.badgeText}
              </a>
            </Button>
          ) : null}
        </div>
        {phone ? (
          <p className="mt-3 text-base">
            {copy.phoneLabel}: <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>
          </p>
        ) : null}
        {email ? (
          <p className="mt-2 text-base">
            {copy.emailLabel}: {email}
          </p>
        ) : null}
        {revealError ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {revealError}
          </p>
        ) : null}
        <p className="mt-4">
          <a href="#corriger" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
            {copy.correctLink}
          </a>
        </p>
        {listing.area ? (
          <div className="mt-4">
            <QcAreaMap
              lat={listing.area.lat}
              lng={listing.area.lng}
              radiusM={listing.area.radiusM}
              label={copy.areaMap.replace("{place}", place)}
              caption={place}
            />
            <p className="mt-2 text-sm text-muted">{copy.areaNote}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{copy.areaNote}</p>
        )}
        <p className="mt-4 max-w-prose text-base leading-6">{listing.openSpotsText}</p>
        {listing.capacity != null ? <p className="mt-2 text-sm leading-6">{copy.capacity.replace("{n}", String(listing.capacity))}</p> : null}
        {listing.agesServed ? (
          <p className="mt-2 text-sm leading-6">
            {copy.ages}: {listing.agesServed}
          </p>
        ) : null}
        {listing.feesText ? (
          <p className="mt-2 text-sm leading-6">
            {copy.fees}: {listing.feesText}
          </p>
        ) : null}
        {listing.website ? (
          <p className="mt-2 text-sm">
            <a href={listing.website} className="font-medium text-primary underline-offset-4 hover:underline" rel="noopener noreferrer" target="_blank">
              {copy.website}
            </a>
          </p>
        ) : null}
        <form id="corriger" onSubmit={(event) => void send(event)} className="mt-4 space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border">
          <h2 className="font-display text-xl">{copy.correctTitle}</h2>
          <p className="text-sm leading-6 text-muted">{copy.correctLead}</p>
          <fieldset className="space-y-2">
            <legend className="sr-only">{copy.correctTitle}</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="kind" checked={kind === "correction"} onChange={() => setKind("correction")} />
              {copy.kindCorrection}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="kind" checked={kind === "removal"} onChange={() => setKind("removal")} />
              {copy.kindRemoval}
            </label>
          </fieldset>
          <label className="block text-sm font-medium">
            {copy.yourName}
            <input required className="ke-input mt-1" value={name} autoComplete="name" onFocus={focusIn} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            {copy.yourEmail}
            <input
              required
              type="email"
              className="ke-input mt-1"
              value={contactEmail}
              autoComplete="email"
              onFocus={focusIn}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            {copy.message}
            <textarea
              required
              minLength={10}
              rows={4}
              className="ke-textarea mt-1"
              value={message}
              onFocus={focusIn}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <TurnstileField onToken={onToken} />
          {formError ? (
            <p className="text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm" role="status">
              {copy.saved}
            </p>
          ) : (
            <Button type="submit" variant="secondary" disabled={busy}>
              {copy.send}
            </Button>
          )}
        </form>
      </main>
    </Shell>
  );
}
