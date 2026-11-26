import { useRouterState } from "@tanstack/react-router";
import { storeLinkAllowed } from "@/lib/app-stores";
import { galaxyStoreDeepLink, galaxyStoreHttps } from "@/lib/samsung/platform";
import { useCopy } from "@/lib/use-copy";

/**
 * Galaxy Store link. Renders nothing until FEATURE_SAMSUNG_STORE_LINK is on.
 * Does not say the listing is available. The https page is the fallback.
 */
export function SamsungStoreLink() {
  const on = useRouterState({
    select: (state) => state.matches.some((match) => (match.context as { samsungStore?: boolean }).samsungStore === true),
  });
  const { t } = useCopy();
  // The flag alone is not enough: the Galaxy listing must be live in APP_STORES,
  // or the link opens a Galaxy Store 404.
  if (!on || !storeLinkAllowed("samsung")) return null;
  const https = galaxyStoreHttps();
  return (
    <p className="mt-3">
      <a
        href={https}
        className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        rel="noopener noreferrer"
        data-ke="samsung-store"
        onClick={(event) => {
          const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
          if (!/Android/i.test(ua)) return;
          event.preventDefault();
          window.location.assign(galaxyStoreDeepLink());
        }}
      >
        {t("storeGalaxyName")}
      </a>
    </p>
  );
}
