import { useState } from "react";
import { APP_STORES, appShareUrl, type AppStoreTile } from "@/lib/app-stores";
import { useCopy } from "@/lib/use-copy";

function storeName(store: AppStoreTile, locale: string) {
  return locale === "fr" ? store.nameFr : store.nameEn;
}

export function AppStoreStatus({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useCopy();
  const [copied, setCopied] = useState(false);
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

  return (
    <section className={compact ? "mt-6" : "mt-8"} data-ke="app-store-status" aria-labelledby="app-store-status-title">
      <h2 id="app-store-status-title" className="font-display text-2xl text-fg">
        {t("appStoresTitle")}
      </h2>
      <p className="mt-2 max-w-2xl text-base leading-6 text-muted">{t("appStoresLead")}</p>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {APP_STORES.map((store) => {
          const name = storeName(store, locale);
          const live = store.live && store.url;
          return (
            <li key={store.id} className="min-w-0 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke={`app-store-${store.id}`} data-live={live ? "1" : "0"}>
              <p className="text-base font-semibold text-fg">{name}</p>
              {live ? (
                <a
                  href={store.url!}
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg touch-manipulation"
                  data-ke={`app-store-link-${store.id}`}
                >
                  {t("appStoresDownload")}
                </a>
              ) : (
                <p className="mt-3 inline-flex min-h-11 items-center text-sm text-muted" data-ke={`app-store-soon-${store.id}`}>
                  {t("storeComingSoon")}
                </p>
              )}
            </li>
          );
        })}
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
