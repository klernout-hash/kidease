import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Download, Laptop, MapPinned, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Shell } from "@/components/shell";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ShotHome, ShotListing, ShotLogin, ShotSearch } from "@/components/app-shots";
import {
  hasInstallPrompt,
  isIosBrowser,
  isMac,
  isStandalone,
  onInstallChange,
  promptInstall,
} from "@/lib/native";
import { STORE } from "@/lib/store-listing";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/get-app")({ component: GetApp });

const SHOTS: { key: string; device: "iphone" | "android"; caption: string; screen: ReactNode }[] = [
  { key: "home", device: "iphone", caption: "Home \u00b7 iPhone", screen: <ShotHome /> },
  { key: "search", device: "iphone", caption: "Search \u00b7 iPhone", screen: <ShotSearch /> },
  { key: "listing", device: "android", caption: "Listing \u00b7 Android", screen: <ShotListing /> },
  { key: "login", device: "android", caption: "Sign in \u00b7 Android", screen: <ShotLogin /> },
];

function GetApp() {
  const { t, locale } = useCopy();
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setCanPrompt(hasInstallPrompt());
    setInstalled(isStandalone());
    setIos(isIosBrowser());
    setMac(isMac());
    return onInstallChange(() => setCanPrompt(hasInstallPrompt()));
  }, []);

  async function install() {
    const ok = await promptInstall();
    if (ok) setInstalled(true);
  }

  const desc = locale === "fr" ? STORE.descriptionFr : STORE.description;
  const phoneLead =
    locale === "fr"
      ? "KidEase sur iPhone et Android \u2014 accueil, recherche, une fiche, et connexion."
      : "KidEase on iPhone and Android \u2014 home, search, a listing, and sign in.";

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-6xl pb-16 pt-8">
        <section className="grid items-center gap-10 md:grid-cols-[1fr_minmax(16rem,20rem)]">
          <div>
            <BrandMark size="md" align="start" />
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.16em] text-muted">{t("getAppKicker")}</p>
            <h1 className="mt-3 font-display text-4xl md:text-5xl">{t("getApp")}</h1>
            <p className="mt-4 max-w-md text-muted">{t("getAppLead")}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {installed ? (
                <p className="rounded-md bg-surface px-4 py-3 text-sm ring-1 ring-border">{t("installed")}</p>
              ) : canPrompt ? (
                <Button size="lg" onClick={() => void install()}>
                  <Smartphone className="size-4" />
                  {t("installThisDevice")}
                </Button>
              ) : ios ? (
                <p className="max-w-sm text-sm text-muted">{t("installIosHint")}</p>
              ) : mac ? (
                <p className="max-w-sm text-sm text-muted">{t("installMacHint")}</p>
              ) : (
                <Button size="lg" asChild>
                  <a href="/?install=1">
                    <Smartphone className="size-4" />
                    {t("installThisDevice")}
                  </a>
                </Button>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <StoreBadge store="apple" label={t("appStore")} />
              <StoreBadge store="play" label={t("googlePlay")} />
            </div>
            <p className="mt-3 text-xs text-subtle">
              {STORE.ageRating} \u00b7 {STORE.price} \u00b7 {STORE.category} \u00b7 v{STORE.version}
            </p>
          </div>
          <DeviceFrame device="iphone">
            <ShotSearch />
          </DeviceFrame>
        </section>

        {mac ? (
          <section className="mt-10 grid gap-4 rounded-xl bg-surface p-6 ring-1 ring-border md:grid-cols-2 md:p-8">
            <div>
              <span className="grid size-10 place-items-center rounded-md bg-bg ring-1 ring-border">
                <Laptop className="size-5" strokeWidth={1.6} />
              </span>
              <h2 className="mt-3 font-display text-2xl">{t("addToDock")}</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
                <li>{locale === "fr" ? "Ouvrez cette page dans Safari." : "Open this page in Safari."}</li>
                <li>{locale === "fr" ? "Menu Fichier \u2192 Ajouter au Dock." : "File menu \u2192 Add to Dock."}</li>
                <li>{locale === "fr" ? "Lancez KidEase depuis le Dock, en plein \u00e9cran." : "Launch KidEase from the Dock, full screen."}</li>
              </ol>
            </div>
            <div>
              <span className="grid size-10 place-items-center rounded-md bg-bg ring-1 ring-border">
                <Download className="size-5" strokeWidth={1.6} />
              </span>
              <h2 className="mt-3 font-display text-2xl">{t("xcodeTitle")}</h2>
              <p className="mt-3 text-sm text-muted">{t("xcodeBody")}</p>
              <Button asChild className="mt-5">
                <a href="/store/KidEase-iOS.zip" download>
                  <Download className="size-4" />
                  {t("downloadXcode")}
                </a>
              </Button>
            </div>
          </section>
        ) : (
          <div className="mt-8">
            <Button asChild variant="secondary">
              <a href="/store/KidEase-iOS.zip" download>
                <Download className="size-4" />
                {t("downloadXcode")}
              </a>
            </Button>
          </div>
        )}

        <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feat icon={MapPinned} title={t("featGps")} body={t("featGpsBody")} />
          <Feat icon={Check} title={t("featCentres")} body={t("featCentresBody")} />
          <Feat icon={Wallet} title={t("featPay")} body={t("featPayBody")} />
          <Feat icon={ShieldCheck} title={t("featSafe")} body={t("featSafeBody")} />
        </section>

        <section className="mt-14 overflow-hidden rounded-xl bg-primary px-4 py-10 text-primary-fg sm:px-8 md:px-10 md:py-14">
          <h2 className="font-display text-2xl text-primary-fg md:text-3xl">{t("onYourPhone")}</h2>
          <p className="mt-2 max-w-xl text-sm text-primary-fg/80">{phoneLead}</p>
          <ul className="mt-10 grid grid-cols-2 items-center gap-5 lg:grid-cols-4 lg:gap-8">
            {SHOTS.map((s) => (
              <li key={s.key} className="min-w-0">
                <DeviceFrame device={s.device}>{s.screen}</DeviceFrame>
                <p className="mt-4 text-center text-xs font-medium tracking-wide text-primary-fg/75">{s.caption}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="store-ready" className="mt-14 rounded-xl bg-surface p-6 ring-1 ring-border md:p-8">
          <h2 className="font-display text-2xl">{t("storeReady")}</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted">{t("storeReadyBody")}</p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <Meta k="Bundle ID" v={STORE.bundleId} />
            <Meta k="Version" v={`${STORE.version} (${STORE.build})`} />
            <Meta k={locale === "fr" ? "Cat\u00e9gorie" : "Category"} v={`${STORE.category} / ${STORE.secondaryCategory}`} />
            <Meta k={locale === "fr" ? "Classification" : "Age rating"} v={STORE.ageRating} />
          </dl>
          <pre className="mt-6 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-bg p-4 text-xs text-muted">
            {desc.split("\n").slice(0, 8).join("\n")}
          </pre>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link to="/privacy" className="underline-offset-4 hover:underline">
              {t("privacy")}
            </Link>
            <Link to="/terms" className="underline-offset-4 hover:underline">
              {t("terms")}
            </Link>
            <Link to="/support" className="underline-offset-4 hover:underline">
              {t("support")}
            </Link>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function Feat({ icon: Icon, title, body }: { icon: typeof MapPinned; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-border">
      <span className="grid size-10 place-items-center rounded-md bg-bg ring-1 ring-border">
        <Icon className="size-5" strokeWidth={1.6} />
      </span>
      <h3 className="mt-3 font-display text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-subtle">{k}</dt>
      <dd className="mt-1 font-medium">{v}</dd>
    </div>
  );
}

function DeviceFrame({ device, children }: { device: "iphone" | "android"; children: ReactNode }) {
  const uid = useId().replace(/:/g, "");
  const iphone = device === "iphone";
  const outerR = iphone ? 32 : 22;
  const bezel = 4;
  const innerR = outerR - bezel;
  return (
    <div
      className="relative mx-auto w-full max-w-[220px] select-none"
      style={{ filter: "drop-shadow(0 14px 18px rgba(8,16,40,0.28))" }}
    >
      <div className={iphone ? "relative aspect-[9/19.5] w-full" : "relative aspect-[9/19.4] w-full"}>
        {iphone ? (
          <>
            <span className="absolute left-[-3px] top-[15.5%] z-20 h-[14px] w-[3px] rounded-l-[2px] bg-[#8a8f99]" />
            <span className="absolute left-[-3px] top-[22.5%] z-20 h-[30px] w-[3px] rounded-l-[2px] bg-[#8a8f99]" />
            <span className="absolute left-[-3px] top-[33%] z-20 h-[30px] w-[3px] rounded-l-[2px] bg-[#8a8f99]" />
            <span className="absolute right-[-3px] top-[27%] z-20 h-[50px] w-[3px] rounded-r-[2px] bg-[#8a8f99]" />
          </>
        ) : (
          <>
            <span className="absolute right-[-3px] top-[19%] z-20 h-[36px] w-[3px] rounded-r-[2px] bg-[#9aa0aa]" />
            <span className="absolute right-[-3px] top-[33%] z-20 h-[54px] w-[3px] rounded-r-[2px] bg-[#9aa0aa]" />
          </>
        )}
        <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible" viewBox="0 0 220 476" aria-hidden>
          <defs>
            <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d5d8de" />
              <stop offset="0.1" stopColor="#7a7f8a" />
              <stop offset="0.42" stopColor="#2c3038" />
              <stop offset="0.72" stopColor="#14161b" />
              <stop offset="1" stopColor="#4a4e58" />
            </linearGradient>
            <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
              <stop offset="0.14" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id={`${uid}-bezel`} maskUnits="userSpaceOnUse">
              <rect width="220" height="476" fill="#fff" />
              <rect x={bezel} y={bezel} width={220 - bezel * 2} height={476 - bezel * 2} rx={innerR} fill="#000" />
            </mask>
          </defs>
          <rect
            x="0.5"
            y="0.5"
            width="219"
            height="475"
            rx={outerR}
            fill={`url(#${uid}-shell)`}
            stroke="#d7dae0"
            strokeWidth="1.15"
            mask={`url(#${uid}-bezel)`}
          />
          <rect x="0.5" y="0.5" width="219" height="475" rx={outerR} fill={`url(#${uid}-shine)`} mask={`url(#${uid}-bezel)`} />
          <rect
            x={bezel}
            y={bezel}
            width={220 - bezel * 2}
            height={476 - bezel * 2}
            rx={innerR}
            fill="none"
            stroke="#050608"
            strokeWidth="1"
          />
        </svg>
        <div className="absolute inset-0 overflow-hidden bg-[#f6f3ee]" style={{ borderRadius: outerR }}>
          {children}
          {iphone ? (
            <span className="pointer-events-none absolute left-1/2 top-[8px] z-20 flex h-[21px] w-[78px] -translate-x-1/2 items-center justify-end rounded-full bg-[#0b0c0f] pr-[8px]">
              <span
                className="size-[7px] rounded-full"
                style={{
                  background: "radial-gradient(circle at 34% 32%, #3a4660 0%, #161a22 58%, #0b0c0f 100%)",
                  boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.2)",
                }}
              />
            </span>
          ) : (
            <span
              className="pointer-events-none absolute left-1/2 top-[8px] z-20 size-[8px] -translate-x-1/2 rounded-full"
              style={{
                background: "radial-gradient(circle at 34% 32%, #3a4660 0%, #161a22 58%, #0b0c0f 100%)",
                boxShadow: "0 0 0 2px #0b0c0f, 0 0 0 2.5px rgba(255,255,255,0.12)",
              }}
            />
          )}
          <span
            className={
              iphone
                ? "pointer-events-none absolute bottom-[7px] left-1/2 z-20 h-[3.5px] w-[86px] -translate-x-1/2 rounded-full bg-[#1c2438]/32"
                : "pointer-events-none absolute bottom-[7px] left-1/2 z-20 h-[3px] w-[70px] -translate-x-1/2 rounded-full bg-[#1c2438]/24"
            }
          />
        </div>
      </div>
    </div>
  );
}

function StoreBadge({ store, label }: { store: "apple" | "play"; label: string }) {
  return (
    <span className="inline-flex h-11 items-center gap-2 rounded-md bg-fg px-3 text-sm text-bg">
      {store === "apple" ? (
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path
            fill="currentColor"
            d="M16.4 12.3c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.8 3-.8s1.8.8 3 .8 2-.1 2.9-2.3c.6-.9 1.1-1.9 1.4-3-1.7-.7-2.7-2.4-2.7-4.4ZM14.7 5.6c.6-.8 1.1-1.9.9-3-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path fill="currentColor" d="M4 3.5v17l10.2-8.5L4 3.5Zm11.1 9.2 2.3 1.9-10 5.8 7.7-7.7Zm2.3-7.1-2.3 1.9L7.4 3.8l10 5.8ZM16.7 12 14 9.8l2.8-2.3 3.5 2.1c.6.4.6 1.2 0 1.6L16.7 12Z" />
        </svg>
      )}
      {label}
    </span>
  );
}
