import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { localeTag } from "@/lib/languages";
import { pathLocale } from "@/lib/locale-path";
import { getVisitorLocale, readFrAuthQc, readFrCaEnabled } from "@/lib/locale-choice";
import { readServerStoreChannel, type ServerStoreRead } from "@/lib/store-channel-request";
import { FrCaDeviceBoot } from "@/components/fr-ca-boot";
import { LocaleChoiceSync } from "@/components/language-select";
import { useCopy } from "@/lib/use-copy";
import { AuthProvider } from "@/lib/auth/provider";
import { ViewAsProvider } from "@/components/view-as-banner";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { NativeBoot } from "@/components/native-boot";
const NativeCommerceStrip = lazy(() =>
  import("@/components/native-commerce-strip").then((m) => ({ default: m.NativeCommerceStrip })),
);
const PushExplain = lazy(() => import("@/components/push-explain").then((m) => ({ default: m.PushExplain })));
const GetAlertsPrompt = lazy(() =>
  import("@/components/get-alerts-prompt").then((m) => ({ default: m.GetAlertsPrompt })),
);
import { ThemeBoot } from "@/components/theme-boot";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { ScreenHistoryRecorder } from "@/components/history-back";
import { RouteProgress } from "@/components/route-progress";
import { PostHogBoot } from "@/components/posthog-boot";
import { AdultConfirmBoot } from "@/components/adult-confirm-boot";
import { RoleBoot } from "@/components/role-boot";
const LiveChatSlot = lazy(() =>
  import("@/components/help-bot").then((m) => ({ default: m.LiveChatSlot })),
);
const KidEaseToaster = lazy(() =>
  import("@/components/kidease-toaster").then((m) => ({ default: m.KidEaseToaster })),
);
const IncomingCallListener = lazy(() =>
  import("@/components/incoming-call-listener").then((m) => ({ default: m.IncomingCallListener })),
);
const SuccessConfirmHost = lazy(() =>
  import("@/components/success-confirm").then((m) => ({ default: m.SuccessConfirmHost })),
);
import { SafeRouteError } from "@/components/safe-error-boundary";
import { installStaleChunkReload, safeErrorCopy } from "@/lib/safe-error";
import { getRoleChrome } from "@/lib/server/role-route";
import { automationLiveEnv, automationMode } from "@/lib/automations";
import { airbnbUiEnabled, posthogErrorsEnabled } from "@/lib/features";
import { readAirbnbUi } from "@/lib/airbnb-ui-flag";
import { STYLE_NONCE_BOOT } from "@/lib/style-nonce-boot";
import { ensureFrenchCopy } from "@/lib/copy-runtime";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import {
  isAccessProtectedPath,
  NATIVE_ADMIN_NOTE_PATH,
  nativeShellHidesAdminNow,
} from "@/lib/native-admin";
import {
  microsoftStoreCookieHeader,
  shellBlocksCommerce,
  storeChannelFromSignals,
  type StoreChannel,
} from "@/lib/native-entitlements";
import { a11yPassEnabled } from "@/lib/a11y-pass";
import { preferredMapProvider } from "@/lib/map-provider";
import { SkipLink } from "@/components/skip-link";
import appCss from "../styles.css?url";

const APP_NAME = "KidEase";
const ICON_VER = "20";
const APP_ICON = `/icon-512.png?v=${ICON_VER}`;

function manifestHref(channel: StoreChannel | undefined): string {
  const file = channel === "microsoft" ? "/manifest.microsoft.webmanifest" : "/manifest.webmanifest";
  return `${file}?v=${ICON_VER}`;
}

/** Warm the map host. Huawei keeps the static fallback and skips this. */
function mapDnsPrefetch(channel: StoreChannel | undefined): { rel: "dns-prefetch"; href: string }[] {
  if (channel === "huawei") return [];
  const hosts =
    preferredMapProvider() === "google"
      ? ["https://maps.googleapis.com", "https://maps.gstatic.com", "https://tiles.openfreemap.org"]
      : ["https://tiles.openfreemap.org"];
  return hosts.map((href) => ({ rel: "dns-prefetch" as const, href }));
}

const GUEST_LOCALE = {
  locale: "en" as const,
  explicit: false,
  source: "default" as const,
  suppressGeo: false,
  redirectTo: null as string | null,
};

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const frenchDoc = location.pathname === "/fr" || location.pathname.startsWith("/fr/");
    if (frenchDoc) await ensureFrenchCopy();
    const barePath =
      location.pathname.length > 1 && location.pathname.endsWith("/")
        ? location.pathname.slice(0, -1)
        : location.pathname;
    if (barePath === "/account/delete") {
      throw redirect({ href: "/delete-account", statusCode: 301 });
    }
    if (barePath === "/fr/account/delete") {
      throw redirect({ href: "/fr/delete-account", statusCode: 301 });
    }
    const search = `${location.searchStr || ""}${location.hash || ""}`;
    const [roleChrome, visitorLocale, frCa, frAuthQc] = await Promise.all([
      getRoleChrome().catch(() => ({
        signedIn: true,
        role: null as null,
        paid: false,
        planLabel: null,
        renewsOn: null,
        ownedSlugs: [] as string[],
        e2e: false,
        degraded: true,
        subscriptionsEnabled: false,
        govPortalLink: false,
      })),
      getVisitorLocale({ data: { pathname: location.pathname, search } }).catch(() => GUEST_LOCALE),
      readFrCaEnabled().catch(() => false),
      readFrAuthQc().catch(() => false),
    ]);
    if (visitorLocale.redirectTo) {
      throw redirect({ href: visitorLocale.redirectTo, statusCode: 302 });
    }
    const storeRead = await readRequestStoreChannel(location.searchStr || "");
    const storeChannel = storeRead.channel;
    const nativeShell = shellBlocksCommerce(storeChannel);
    const hideAdmin = storeRead.hideAdmin;
    if (hideAdmin && isAccessProtectedPath(location.pathname)) {
      throw redirect({ href: NATIVE_ADMIN_NOTE_PATH, statusCode: 302 });
    }
    return {
      roleChrome,
      visitorLocale,
      nativeShell,
      storeChannel,
      hideAdmin,
      microsoftSetCookie: storeRead.setCookie,
      a11yPass: a11yPassEnabled(),
      posthogErrors:
        automationMode(posthogErrorsEnabled(), process.env[automationLiveEnv("FEATURE_POSTHOG_ERRORS")]) ===
        "live",
      frCa: frCa === true,
      frAuthQc: frAuthQc === true,
      airbnbUi: await readAirbnbUi().catch(() => airbnbUiEnabled()),
    };
  },
  errorComponent: (props) => {
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const copy = safeErrorCopy(path);
    return (
      <SafeRouteError
        {...props}
        links={
          <>
            {path.startsWith("/admin") && !nativeShellHidesAdminNow() ? <a href="/admin">{copy.admin}</a> : null}
            <a href="/search">{copy.explore}</a>
            <a href="/">{copy.home}</a>
            <a href={`mailto:${SUPPORT_INBOX_EMAIL}`}>{copy.support}</a>
          </>
        }
      />
    );
  },
  headers: ({ match }) => {
    const setCookie = match.context.microsoftSetCookie;
    if (!setCookie) return undefined;
    return { "set-cookie": setCookie };
  },
  head: ({ match }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover, shrink-to-fit=no" },
      { name: "theme-color", content: "#1A3790" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "application-name", content: APP_NAME },
      ...(match.context.storeChannel === "microsoft"
        ? [
            { name: "msapplication-TileColor", content: "#1A3790" },
            { name: "msapplication-TileImage", content: APP_ICON },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: `/favicon.svg?v=${ICON_VER}` },
      { rel: "icon", type: "image/png", sizes: "16x16", href: `/favicon-16.png?v=${ICON_VER}` },
      { rel: "icon", type: "image/png", sizes: "32x32", href: `/favicon-32.png?v=${ICON_VER}` },
      { rel: "icon", type: "image/x-icon", href: `/favicon.ico?v=${ICON_VER}` },
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: `/icons/icon-192.png?v=${ICON_VER}`,
      },
      { rel: "icon", type: "image/png", sizes: "512x512", href: APP_ICON },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: manifestHref(match.context.storeChannel) },
      { rel: "apple-touch-icon", sizes: "180x180", href: `/apple-touch-icon.png?v=${ICON_VER}` },
      { rel: "apple-touch-icon", sizes: "512x512", href: APP_ICON },
      { rel: "apple-touch-icon", href: APP_ICON },
      { rel: "apple-touch-icon-precomposed", href: APP_ICON },
      {
        rel: "preload",
        href: "/fonts/plus-jakarta-sans-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "preload", href: "/logo-transparent.svg?v=17", as: "image", type: "image/svg+xml" },
      ...mapDnsPrefetch(match.context.storeChannel),
    ],
  }),
  component: RootDocument,
});

/** Call and chat chunks wait until a tap or a few seconds, so they miss the first paint. */
function AfterFirstPaint({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let open = false;
    const start = () => {
      if (open) return;
      open = true;
      setShow(true);
    };
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", start, opts);
    window.addEventListener("keydown", start, opts);
    const idle =
      typeof requestIdleCallback === "function" ? requestIdleCallback(start, { timeout: 4000 }) : undefined;
    const timer = window.setTimeout(start, 4000);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      if (idle !== undefined) cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, []);
  if (!show) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

async function readRequestStoreChannel(search: string): Promise<ServerStoreRead> {
  if (typeof window !== "undefined") {
    const signals = {
      userAgent: window.navigator.userAgent,
      search: window.location.search || search,
      cookie: document.cookie,
    };
    return {
      channel: storeChannelFromSignals(signals),
      setCookie: microsoftStoreCookieHeader(signals, { secure: window.location.protocol === "https:" }),
      hideAdmin: nativeShellHidesAdminNow(),
    };
  }
  return readServerStoreChannel({ data: { search } }).catch(() => ({
    channel: storeChannelFromSignals({ search }),
    setCookie: null,
    hideAdmin: false,
  }));
}

function RootDocument() {
  useEffect(() => installStaleChunkReload(), []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nativeShell = Route.useRouteContext({ select: (s) => Boolean(s.nativeShell) });
  const hideAdmin = Route.useRouteContext({ select: (s) => Boolean(s.hideAdmin) });
  const storeChannel = Route.useRouteContext({ select: (s) => s.storeChannel ?? "web" });
  const a11yPass = Route.useRouteContext({ select: (s) => Boolean(s.a11yPass) });
  const posthogErrors = Route.useRouteContext({ select: (s) => Boolean(s.posthogErrors) });
  const airbnbUi = Route.useRouteContext({ select: (s) => s.airbnbUi === true });
  const { locale } = useCopy();
  const lang =
    pathLocale(pathname) === "fr" || locale === "fr" ? "fr-CA" : locale === "en" ? "en" : localeTag(locale);
  return (
    <html
      lang={lang}
      className="antialiased"
      data-channel="website"
      data-native={hideAdmin ? "1" : undefined}
      data-runtime={nativeShell ? "native" : "web"}
      data-store={storeChannel}
      data-theme="dark"
      data-resolved-theme="dark"
      data-ui={airbnbUi ? "airbnb-v1" : undefined}
      suppressHydrationWarning
    >
      <head>
        <script
          data-ke-style-nonce=""
          dangerouslySetInnerHTML={{ __html: STYLE_NONCE_BOOT }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html,body{margin:0;background:#f3f1ec;color:#1c1915}" +
              "html[data-ke-launch-hold] [data-ke=home-discovery-surface]{display:none!important}" +
              "[data-ke=launch-shell]{display:none}" +
              "html[data-ke-launch-hold] [data-ke=launch-shell]{display:flex!important;min-height:70dvh;align-items:center;justify-content:center;padding:24px}" +
              'html[data-resolved-theme="dark"],html[data-resolved-theme="dark"] body{background:#14161c;color:#f3efe8}' +
              ".ke-skel{border-radius:14px;background:#eee8df}" +
              'html[data-resolved-theme="dark"] .ke-skel{background:#262b36}' +
              "img.ke-photo{background-color:#eee8df}" +
              "[data-ke-mark]{display:inline-flex;flex-direction:column}" +
              "[data-ke-mark] img{display:block;object-fit:contain;max-width:80px;max-height:80px}" +
              "[data-ke-mark=sm] img{width:36px;height:36px}" +
              "[data-ke-mark=md] img{width:64px;height:64px}" +
              "[data-ke-mark=lg] img{width:80px;height:80px}" +
              'html[data-native="1"] a[href="/admin"],html[data-native="1"] a[href^="/admin?"],html[data-native="1"] a[href^="/admin/"],html[data-native="1"] a[href^="/admin-"],html[data-native="1"] [data-desk="admin"],html[data-native="1"] [data-ke="admin-desk"],html[data-native="1"] [data-ke="admin-guest-view"]{display:none!important}',
          }}
        />
        <link rel="preload" href={appCss} as="style" />
        <link rel="preconnect" href="https://media.kidease.ca" />
        {/* Route preloads (home hero) start before the blocking boot scripts. */}
        <HeadContent />
        <script src="/channel-boot.js?v=10" />
        <script src="/theme-boot.js" />
        {/* Versioned: the edge keeps boot scripts for a long time. Bump v when look-boot.js changes. */}
        <script src="/look-boot.js?v=1" />
        <script defer src="/asset-recover.js" />
      </head>
      <body className="flex min-h-[100dvh] w-full min-w-0 flex-col overflow-x-clip">
        <SkipLink enabled={a11yPass} />
        <PreviewHostBridge />
        <AuthProvider>
          <ViewAsProvider>
          <ThemeBoot />
          <LocaleChoiceSync />
          <FrCaDeviceBoot />
          <NativeBoot />
          <Suspense fallback={null}>
            <NativeCommerceStrip />
            <PushExplain />
            {nativeShell ? null : <GetAlertsPrompt />}
          </Suspense>
          <PostHogBoot captureExceptions={posthogErrors} />
          <RoleBoot />
          <AdultConfirmBoot />
          <RouteProgress />
          <ScreenHistoryRecorder />
          <div id="main-content" tabIndex={-1} className="flex w-full min-w-0 flex-1 flex-col outline-none">
            <Outlet />
          </div>
          <AfterFirstPaint>
            <LiveChatSlot />
            <IncomingCallListener />
          </AfterFirstPaint>
          </ViewAsProvider>
          <CookieConsentBanner />
          <Suspense fallback={null}>
            <KidEaseToaster />
            <SuccessConfirmHost />
          </Suspense>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
