import { openInMapsHref, mapsPlatformFromSignals, type MapsPlatform } from "@/lib/open-in-maps";
import { useCopy } from "@/lib/use-copy";
import { useStoreChannel } from "@/lib/use-native-shell";

type Props = {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  compact?: boolean;
};

export function OpenInMapsLink({
  href,
  label,
  address,
  lat,
  lng,
}: {
  href?: string;
  label?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const { locale } = useCopy();
  const channel = useStoreChannel();
  const fr = locale === "fr";
  const platform: MapsPlatform =
    typeof navigator === "undefined"
      ? mapsPlatformFromSignals({ channel })
      : mapsPlatformFromSignals({
          channel,
          userAgent: navigator.userAgent,
          native: document.documentElement.dataset.native === "1",
        });
  const native = typeof document !== "undefined" && document.documentElement.dataset.native === "1";
  const url = href || openInMapsHref({ platform, address, lat, lng, native });
  return (
    <a
      href={url}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg touch-manipulation"
      data-ke="open-in-maps"
    >
      {label || (fr ? "Ouvrir dans Plans" : "Open in Maps")}
    </a>
  );
}

/** Shown when an embedded map does not load. Does not name the map provider. */
export function MapUnavailable({ address, lat, lng, compact = false }: Props) {
  const { locale } = useCopy();
  const channel = useStoreChannel();
  const fr = locale === "fr";
  const platform: MapsPlatform =
    typeof navigator === "undefined"
      ? mapsPlatformFromSignals({ channel })
      : mapsPlatformFromSignals({
          channel,
          userAgent: navigator.userAgent,
          native: document.documentElement.dataset.native === "1",
        });
  const native = typeof document !== "undefined" && document.documentElement.dataset.native === "1";
  const href = openInMapsHref({ platform, address, lat, lng, native });
  const place = String(address || "").trim();
  return (
    <div
      className={
        compact
          ? "grid min-h-40 place-items-center bg-map px-4 py-6 text-center"
          : "grid h-full min-h-[12rem] place-items-center bg-map px-4 text-center"
      }
      data-ke="map-unavailable"
      role="status"
    >
      <div className="max-w-sm">
        <p className="font-medium text-fg">{fr ? "Carte non disponible" : "Map unavailable"}</p>
        {place ? <p className="mt-2 text-sm text-fg">{place}</p> : null}
        <p className="mt-2 text-sm text-muted">
          {fr ? "La liste des garderies reste sur cette page." : "The daycare list stays on this page."}
        </p>
        <OpenInMapsLink href={href} label={fr ? "Ouvrir dans Plans" : "Open in Maps"} />
      </div>
    </div>
  );
}
