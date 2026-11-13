import { Link } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { BadgeImage } from "@/components/store-badges";
import { appStoreById, liveAppStores } from "@/lib/app-stores";
import type { ShippedLocale } from "@/lib/languages";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

/** Footer uses known download destinations without turning every store into a card. */
export function FooterAppBadges() {
  const { t, locale } = useCopy();
  const stores = liveAppStores();
  const huawei = appStoreById("huawei");
  const huaweiLinked = stores.some((store) => store.id === "huawei");
  return (
    <section className="ke-footer-apps" data-ke="footer-app-badges" aria-label={t("appStoresTitle")}>
      <Link to={localePath("/get-app", locale)} className="ke-footer-app-title">
        {t("appStoresTitle")}
      </Link>
      <ul className="ke-footer-store-row">
        {stores.map((store) => {
          const name = locale === "fr" ? store.nameFr : store.nameEn;
          return (
            <li key={store.id}>
              <a
                href={store.url!}
                className="ke-footer-store-badge"
                aria-label={`${t("appStoresDownload")} · ${name}`}
                rel="noopener noreferrer"
                data-ke={`footer-store-${store.id}`}
              >
                {store.id === "huawei" ? name : (
                  <span className="ke-footer-store-art">
                    <BadgeImage store={store.id} locale={locale as ShippedLocale} compact />
                  </span>
                )}
              </a>
            </li>
          );
        })}
        {huawei?.live && !huaweiLinked ? (
          <li>
            {/* Kyle confirmed availability. Keep the name until the public listing URL is known. */}
            <span className="ke-footer-store-name" data-ke="footer-store-huawei">
              <Smartphone className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{locale === "fr" ? huawei.nameFr : huawei.nameEn}</span>
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
