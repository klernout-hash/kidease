import { useState } from "react";
import { appShareUrl, liveAppStores, type AppStoreTile } from "@/lib/app-stores";
import { useNativeHidesAdmin as useCapacitorShell } from "@/lib/use-native-shell";
import { useCopy } from "@/lib/use-copy";

function storeName(store: AppStoreTile, locale: string) {
  return locale === "fr" ? store.nameFr : store.nameEn;
}

export function AppStoreStatus({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useCopy();
  const [copied, setCopied] = useState(false);
  const native = useCapacitorShell();
  const stores = liveAppStores();
  const shareUrl = appShareUrl("https://kidease.ca");

  async function share() {
    const payload = { title: "KidEase", text: t("appStoresShareText"), url: shareUrl };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch {
        /* The visitor dismissed the sheet. Offer the copy fallback. */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (native || !stores.length) return null;

  return (
    <section className={compact ? "mt-6" : "mt-8"} data-ke="app-store-status" aria-labelledby="app-store-status-title">
      <h2 id="app-store-status-title" className="font-display text-2xl text-fg">
        {t("appStoresTitle")}
      </h2>
      <p className="mt-2 max-w-2xl text-base leading-6 text-muted">{t("appStoresLead")}</p>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <li key={store.id} className="min-w-0 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke={`app-store-${store.id}`} data-live="1">
            <p className="text-base font-semibold text-fg">{storeName(store, locale)}</p>
            <a
              href={store.url ?? undefined}
              target={store.id === "huawei" ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg touch-manipulation"
              data-ke={`app-store-link-${store.id}`}
            >
              {t("appStoresDownload")}
            </a>
            <p className="mt-2 text-sm text-muted">{t("storeAvailableNow")}</p>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => void share()}
        className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-surface-2 px-4 text-sm font-semibold text-fg ring-1 ring-border touch-manipulation"
        data-ke="app-store-share"
      >
        {copied ? t("appStoresCopied") : t("appStoresShare")}
      </button>
    </section>
  );
}
