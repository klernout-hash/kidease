import { useCopy } from "@/lib/use-copy";

export function HomeScreenGuide() {
  const { t } = useCopy();
  return (
    <section id="add-to-home" className="mt-14 rounded-xl bg-surface p-6 ring-1 ring-border md:p-8">
      <h2 className="font-display text-2xl">{t("homeScreenTitle")}</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted">{t("homeScreenLead")}</p>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="font-display text-lg">{t("homeScreenIosTitle")}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>{t("homeScreenIos1")}</li>
            <li>{t("homeScreenIos2")}</li>
            <li>{t("homeScreenIos3")}</li>
            <li>{t("homeScreenIos4")}</li>
          </ol>
        </div>
        <div>
          <h3 className="font-display text-lg">{t("homeScreenAndroidTitle")}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>{t("homeScreenAndroid1")}</li>
            <li>{t("homeScreenAndroid2")}</li>
            <li>{t("homeScreenAndroid3")}</li>
            <li>{t("homeScreenAndroid4")}</li>
          </ol>
        </div>
      </div>
      <p className="mt-6 text-sm text-subtle">{t("homeScreenSafariNote")}</p>
    </section>
  );
}
