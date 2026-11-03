import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { AMAZON_APPSTORE_URL, openAmazonListing } from "@/lib/amazon-appstore";
import type { ShippedLocale } from "@/lib/languages";
import { useCopy } from "@/lib/use-copy";

/**
 * Official store badges. Files are the artwork each store publishes.
 * Languages without an official badge use the English file.
 * Huawei AppGallery does not publish a badge until a listing exists in
 * AppGallery Connect, so that tile is the store name, not a redrawn mark.
 */
const BADGES: Record<
  "amazon" | "apple" | "play" | "samsung" | "microsoft",
  { src: Partial<Record<ShippedLocale, string>> & { en: string } }
> = {
  amazon: {
    src: {
      en: "/store/badges/amazon-en.png",
      fr: "/store/badges/amazon-fr.png",
      de: "/store/badges/amazon-de.png",
      es: "/store/badges/amazon-es.png",
      it: "/store/badges/amazon-it.png",
    },
  },
  apple: {
    src: {
      en: "/store/badges/apple-en.svg",
      fr: "/store/badges/apple-fr.svg",
      de: "/store/badges/apple-de.svg",
      es: "/store/badges/apple-es.svg",
      it: "/store/badges/apple-it.svg",
      zh: "/store/badges/apple-zh.svg",
      yue: "/store/badges/apple-yue.svg",
    },
  },
  play: {
    src: {
      en: "/store/badges/play-en.png",
      fr: "/store/badges/play-fr.png",
      de: "/store/badges/play-de.png",
      es: "/store/badges/play-es.png",
      it: "/store/badges/play-it.png",
      zh: "/store/badges/play-zh.png",
      yue: "/store/badges/play-yue.png",
      ar: "/store/badges/play-ar.png",
    },
  },
  samsung: {
    src: {
      en: "/store/badges/samsung-en.png",
      es: "/store/badges/samsung-es.png",
    },
  },
  microsoft: {
    src: {
      en: "/store/badges/microsoft-en.svg",
      fr: "/store/badges/microsoft-fr.png",
      de: "/store/badges/microsoft-de.png",
      es: "/store/badges/microsoft-es.png",
      it: "/store/badges/microsoft-it.png",
      zh: "/store/badges/microsoft-zh.svg",
      yue: "/store/badges/microsoft-yue.svg",
    },
  },
};

const SOON = ["apple", "play", "samsung", "microsoft", "huawei"] as const;

function badgeSrc(store: keyof typeof BADGES, locale: ShippedLocale): string {
  return BADGES[store].src[locale] ?? BADGES[store].src.en;
}

function onAmazonClick(event: MouseEvent<HTMLAnchorElement>) {
  const web = event.currentTarget.href;
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (openAmazonListing(web, ua)) event.preventDefault();
}

export function StoreBadges() {
  const { t, locale } = useCopy();
  const lang = locale as ShippedLocale;
  const amazonUrl = AMAZON_APPSTORE_URL();
  const names = {
    amazon: t("storeAmazonName"),
    apple: t("appStore"),
    play: t("googlePlay"),
    samsung: t("storeGalaxyName"),
    microsoft: t("storeMicrosoftName"),
    huawei: t("storeHuaweiName"),
  };

  return (
    <section
      id="stores"
      data-ke="store-coming-soon"
      className="mt-6 max-[430px]:pr-[4.75rem]"
      aria-labelledby="store-badges-title"
    >
      <h2 id="store-badges-title" className="font-display text-2xl">
        {amazonUrl ? names.amazon : t("storeComingSoonTitle")}
      </h2>
      {amazonUrl ? (
        <Button asChild size="lg" className="mt-4 h-auto min-h-11 w-full max-w-md whitespace-normal px-4 py-2 text-center sm:w-auto">
          <a href={amazonUrl} onClick={onAmazonClick} rel="noopener noreferrer" data-ke="amazon-appstore">
            {t("storeAmazonGet")}
          </a>
        </Button>
      ) : null}
      <p className="mt-3 max-w-2xl text-sm text-muted">
        {amazonUrl ? t("storeAmazonReadyLead") : t("storeAmazonPending")}
      </p>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t("storeComingSoonLead")}</p>
      <ul className="mt-5 grid grid-cols-1 gap-3 min-[431px]:grid-cols-2 lg:grid-cols-3">
        <li className="min-w-0 rounded-xl bg-surface p-3 ring-1 ring-border">
          {amazonUrl ? (
            <a
              href={amazonUrl}
              onClick={onAmazonClick}
              rel="noopener noreferrer"
              className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={t("storeAmazonGet")}
            >
              <BadgeImage store="amazon" locale={lang} />
            </a>
          ) : (
            <BadgeImage store="amazon" locale={lang} muted />
          )}
          <p className="mt-2 text-sm font-medium">{names.amazon}</p>
          <p className="text-sm text-muted">{amazonUrl ? t("storeAvailableNow") : t("storeAmazonPending")}</p>
        </li>
        {SOON.map((store) => (
          <li key={store} className="min-w-0 rounded-xl bg-surface p-3 ring-1 ring-border" aria-disabled="true">
            {store === "huawei" ? null : <BadgeImage store={store} locale={lang} muted />}
            <p className={store === "huawei" ? "text-sm font-medium" : "mt-2 text-sm font-medium"}>{names[store]}</p>
            <p className="text-sm text-muted">{t("storeComingSoon")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BadgeImage({
  store,
  locale,
  muted,
}: {
  store: keyof typeof BADGES;
  locale: ShippedLocale;
  muted?: boolean;
}) {
  return (
    <img
      src={badgeSrc(store, locale)}
      alt=""
      className={muted ? "h-10 w-auto max-w-full opacity-60 grayscale" : "h-10 w-auto max-w-full"}
      decoding="async"
    />
  );
}
