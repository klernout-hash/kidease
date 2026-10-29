import { useCopy } from "@/lib/use-copy";

/**
 * Shown instead of Google Maps on the Huawei build.
 * City and postal search stay on the page. This is not a second map SDK.
 */
export function StoreMapFallback({ compact = false }: { compact?: boolean }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <div
      className={
        compact
          ? "rounded-xl bg-[#F7F4EF] px-4 py-6 text-center"
          : "grid h-full min-h-[12rem] place-items-center bg-[#F7F4EF] px-4 text-center"
      }
      data-ke="map-fallback"
    >
      <div className="max-w-sm">
        <p className="font-medium text-fg">
          {fr ? "La carte Google n’est pas offerte sur cet appareil." : "Google Maps is not available on this device."}
        </p>
        <p className="mt-2 text-sm text-muted">
          {fr
            ? "Cherchez par ville. La liste des garderies reste ici."
            : "Search by city. The daycare list stays on this page."}
        </p>
      </div>
    </div>
  );
}
