import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { appStoreById } from "@/lib/app-stores";
import { AMAZON_APPSTORE_URL, openAmazonListing } from "@/lib/amazon-appstore";
import { huaweiBadgeAlt } from "@/lib/huawei-badge-alt";
import type { ShippedLocale } from "@/lib/languages";
import { useCopy } from "@/lib/use-copy";

/**
 * Official store badges. Files are the artwork each store publishes.
 * Languages without an official badge use the English file.
 * AppGallery's public black badge is English ("EXPLORE IT ON AppGallery").
 * Huawei also prints a French lockup, but that SVG is not in the public kit,
 * so French uses the English file. The alt string is still French.
 */
const BADGES: Record<
  "amazon" | "apple" | "play" | "samsung" | "microsoft" | "huawei",
  { src: Partial<Record<ShippedLocale, string>> & { en: string }; width: number; height: number }
> = {
  amazon: {
    width: 572,
    height: 168,
    src: {
      en: "/store/badges/amazon-en.png",
      fr: "/store/badges/amazon-fr.png",
      de: "/store/badges/amazon-de.png",
      es: "/store/badges/amazon-es.png",
      it: "/store/badges/amazon-it.png",
    },
  },
  apple: {
    width: 120,
    height: 40,
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
    width: 646,
    height: 250,
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
    width: 652,
    height: 177,
    src: {
      en: "/store/badges/samsung-en.png",
      es: "/store/badges/samsung-es.png",
    },
  },
  microsoft: {
    width: 161,
    height: 44,
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
  huawei: {
    width: 564,
    height: 168,
    src: { en: "/store/badges/huawei-en.svg" },
  },
};

const TILES = ["amazon", "play", "huawei", "apple", "samsung", "microsoft"] as const;

function badgeSrc(store: keyof typeof BADGES, locale: ShippedLocale): string {
  return BADGES[store].src[locale] ?? BADGES[store].src.en;
}

function onAmazonClick(event: MouseEvent<HTMLAnchorElement>) {
  const web = event.currentTarget.href;
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (openAmazonListing(web, ua)) event.preventDefault();
}

export function StoreBadges({
  huaweiHref = null,
  amazonHref,
  lead = "play",
}: {
  huaweiHref?: string | null;
  amazonHref?: string | null;
  /**
   * Which store leads. Google Play by default (Android). Amazon only on Fire /
   * Silk / KF devices or with the ke_store=amazon cookie; the page decides.
   */
  lead?: "play" | "amazon";
} = {}) {
  const { t, locale } = useCopy();
  const lang = locale as ShippedLocale;
  const amazonUrl = appStoreById("amazon")?.live
    ? amazonHref === undefined ? AMAZON_APPSTORE_URL() : amazonHref
    : null;
  const playStore = appStoreById("play");
  const playUrl = playStore?.live ? playStore.url : null;
  const leadStore: "play" | "amazon" | null =
    lead === "amazon" && amazonUrl ? "amazon" : playUrl ? "play" : amazonUrl ? "amazon" : null;
  const names = {
    amazon: t("storeAmazonName"),
    apple: t("appStore"),
    play: t("googlePlay"),
    samsung: t("storeGalaxyName"),
    microsoft: t("storeMicrosoftName"),
    huawei: t("storeHuaweiName"),
  };
  const order: readonly (typeof TILES)[number][] =
    leadStore === "amazon" ? TILES : ["play", "amazon", "huawei", "apple", "samsung", "microsoft"];

  const amazonTile = (
    <li key="amazon" className="min-w-0 rounded-xl bg-surface p-3 ring-1 ring-border">
      <a
        href={amazonUrl ?? undefined}
        onClick={onAmazonClick}
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={t("storeAmazonGet")}
      >
        <BadgeImage store="amazon" locale={lang} />
      </a>
      <p className="mt-2 text-sm font-medium">{names.amazon}</p>
      <p className="text-sm text-muted">{t("storeAvailableNow")}</p>
    </li>
  );

  return (
    <section
      id="stores"
      data-ke="store-coming-soon"
      data-lead-store={leadStore ?? "none"}
      className="mt-6 max-[430px]:pr-[4.75rem]"
      aria-labelledby="store-badges-title"
    >
      <h2 id="store-badges-title" className="font-display text-2xl">
        {leadStore ? names[leadStore] : t("storeComingSoonTitle")}
      </h2>
      {leadStore === "amazon" && amazonUrl ? (
        <Button asChild size="lg" className="mt-4 h-auto min-h-11 w-full max-w-md whitespace-normal px-4 py-2 text-center sm:w-auto">
          <a href={amazonUrl} onClick={onAmazonClick} rel="noopener noreferrer" data-ke="amazon-appstore">
            {t("storeAmazonGet")}
          </a>
        </Button>
      ) : leadStore === "play" && playUrl ? (
        <Button asChild size="lg" className="mt-4 h-auto min-h-11 w-full max-w-md whitespace-normal px-4 py-2 text-center sm:w-auto">
          <a href={playUrl} target="_blank" rel="noopener noreferrer" data-ke="play-store-lead">
            {t("storePlayGet")}
          </a>
        </Button>
      ) : null}
      <p className="mt-3 max-w-2xl text-sm text-muted">
        {leadStore === "amazon" ? t("storeAmazonReadyLead") : leadStore === "play" ? t("storePlayReadyLead") : t("storeAmazonPending")}
      </p>
      <ul className="mt-5 grid grid-cols-1 gap-3 min-[431px]:grid-cols-2 lg:grid-cols-3">
        {order.map((store) => {
          if (store === "amazon") return amazonUrl ? amazonTile : null;
          const configured = appStoreById(store);
          if (!configured?.live) return null;
          const tileHref = store === "huawei" && huaweiHref ? huaweiHref : configured.url;
          if (!tileHref) return null;
          return (
            <li key={store} className="min-w-0 rounded-xl bg-surface p-3 ring-1 ring-border">
              <a href={tileHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center" data-ke={`store-link-${store}`} aria-label={names[store]}>
                <BadgeImage store={store} locale={lang} alt={store === "huawei" ? huaweiBadgeAlt(lang) : names[store]} />
              </a>
              <p className="mt-2 text-sm font-medium">{names[store]}</p>
              <p className="text-sm text-muted">{t("storeAvailableNow")}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BadgeImage({
  store,
  locale,
  muted,
  compact = false,
  alt = "",
}: {
  store: keyof typeof BADGES;
  locale: ShippedLocale;
  muted?: boolean;
  compact?: boolean;
  alt?: string;
}) {
  const box = BADGES[store];
  return (
    <img
      src={badgeSrc(store, locale)}
      alt={alt}
      width={box.width}
      height={box.height}
      className={`ke-store-badge ${compact ? "h-8" : "h-10"} w-auto max-w-none${muted ? " opacity-60 grayscale" : ""}`}
      // Badges sit in the footer and menus: never compete with the first screen.
      loading="lazy"
      decoding="async"
    />
  );
}
