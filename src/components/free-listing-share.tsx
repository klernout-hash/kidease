import { useState } from "react";
import { Check, Link2, Mail, MapPinned } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText, listingMailtoHref, listingShareUrl } from "@/lib/share";
import { openDirections } from "@/lib/maps";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function CopyListingLinkButton({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  const { t } = useCopy();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const url = listingShareUrl(slug);
    const ok = await copyText(url);
    if (ok) {
      toast.success(t("linkCopied"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
      return;
    }
    toast.error(t("shareFailed"));
  }

  return (
    <Button type="button" variant="secondary" className={className} onClick={() => void onCopy()}>
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {copied ? t("linkCopied") : t("copyLink")}
      <span className="sr-only">{name}</span>
    </Button>
  );
}

export function FreeListingShareActions({
  slug,
  name,
  lat,
  lng,
  className,
}: {
  slug: string;
  name: string;
  lat?: number;
  lng?: number;
  className?: string;
}) {
  const { t } = useCopy();
  const mailto = listingMailtoHref({ name, slug, note: t("freeListingNotAd") });
  const hasMaps = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <CopyListingLinkButton slug={slug} name={name} />
      {hasMaps ? (
        <Button type="button" variant="secondary" onClick={() => void openDirections(lat as number, lng as number, name)}>
          <MapPinned className="size-4" />
          {t("directions")}
        </Button>
      ) : null}
      <Button asChild variant="secondary">
        <a href={mailto}>
          <Mail className="size-4" />
          {t("emailListing")}
        </a>
      </Button>
    </div>
  );
}

/** Director explainer: free page URL + GMB/FB (no auto-post). */
export function FreePageExplainer({
  listings,
}: {
  listings: Array<{ slug: string; name: string; nameFr?: string; lat?: number; lng?: number }>;
}) {
  const { t, locale } = useCopy();
  if (!listings.length) return null;
  return (
    <section className="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
      <h2 className="font-display text-2xl">{t("freePageTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("freePageLead")}</p>
      <p className="mt-2 text-xs text-subtle">{t("freePageShareHint")}</p>
      <ul className="mt-4 space-y-4">
        {listings.map((row) => {
          const name = locale === "fr" ? row.nameFr || row.name : row.name;
          const url = listingShareUrl(row.slug);
          return (
            <li key={row.slug} className="rounded-lg bg-bg p-3 ring-1 ring-border">
              <p className="font-medium">{name}</p>
              <p className="mt-1 break-all text-sm text-primary">{url}</p>
              <FreeListingShareActions
                className="mt-3"
                slug={row.slug}
                name={name}
                lat={row.lat}
                lng={row.lng}
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm font-medium">{t("listingStayFree")}</p>
    </section>
  );
}
