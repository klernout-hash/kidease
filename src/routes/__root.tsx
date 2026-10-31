import { useEffect } from "react";
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
import { getVisitorLocale, readFrCaEnabled } from "@/lib/locale-choice";
import { readServerStoreChannel, type ServerStoreRead } from "@/lib/store-channel-request";
import { FrCaDeviceBoot } from "@/components/fr-ca-boot";
import { LocaleChoiceSync } from "@/components/language-select";
import { useCopy } from "@/lib/use-copy";
import { AuthProvider } from "@/lib/auth/provider";
import { ViewAsProvider } from "@/components/view-as-banner";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { NativeBoot } from "@/components/native-boot";
import { NativeCommerceStrip } from "@/components/native-commerce-strip";
import { PushExplain } from "@/components/push-explain";
import { GetAlertsPrompt } from "@/components/get-alerts-prompt";
import { ThemeBoot } from "@/components/theme-boot";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { RouteProgress } from "@/components/route-progress";
import { PostHogBoot } from "@/components/posthog-boot";
import { AdultConfirmBoot } from "@/components/adult-confirm-boot";
import { RoleBoot } from "@/components/role-boot";
import { LiveChatSlot } from "@/components/help-bot";
import { KidEaseToaster } from "@/components/kidease-toaster";
import { SuccessConfirmHost } from "@/components/success-confirm";
import { SafeRouteError } from "@/components/safe-error-boundary";
import { installStaleChunkReload, safeErrorCopy } from "@/lib/safe-error";
import { getRoleChrome } from "@/lib/server/role-route";
import { STYLE_NONCE_BOOT } from "@/lib/style-nonce-boot";
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
import { SkipLink } from "@/components/skip-link";
import appCss from "../styles.css?url";

const APP_NAME = "KidEase";
const ICON_VER = "20";
const APP_ICON = `/icon-512.png?v=${ICON_VER}`;

function manifestHref(channel: StoreChannel | undefined): string {
  const file = channel === "microsoft" ? "/manifest.microsoft.webmanifest" : "/manifest.webmanifest";
  return `${file}?v=${ICON_VER}`;
}

/** Warm the map tile host. Huawei keeps the static fallback and skips this. */
function mapDnsPrefetch(channel: StoreChannel | undefined): { rel: "dns-prefetch"; href: string }[] {
  if (channel === "huawei") return [];
  return [{ rel: "dns-prefetch", href: "https://tiles.openfreemap.org" }];
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
    const [roleChrome, visitorLocale, frCa] = await Promise.all([
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
      })),
      getVisitorLocale({ data: { pathname: location.pathname, search } }).catch(() => GUEST_LOCALE),
      readFrCaEnabled().catch(() => false),
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
<<<<<<< HEAD
      a11yPass: a11yPassEnabled(),
=======
      frCa: frCa === true,
>>>>>>> c8199c26 (Add the French (fr-CA) pack behind FEATURE_FR_CA.)
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
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
      data-theme="system"
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
              "html,body{margin:0;background:#f6f3ee;color:#1c2438}" +
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
        <script src="/asset-recover.js" />
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
          <NativeCommerceStrip />
          <PushExplain />
          {nativeShell ? null : <GetAlertsPrompt />}
          <PostHogBoot />
          <RoleBoot />
          <AdultConfirmBoot />
          <RouteProgress />
          <div id="main-content" tabIndex={-1} className="flex w-full min-w-0 flex-1 flex-col outline-none">
            <Outlet />
          </div>
          <LiveChatSlot />
          </ViewAsProvider>
          <CookieConsentBanner />
          <KidEaseToaster />
          <SuccessConfirmHost />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
