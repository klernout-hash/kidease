import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { NativeBoot } from "@/components/native-boot";
import { PostHogBoot } from "@/components/posthog-boot";
import { RoleBoot } from "@/components/role-boot";
import { Toaster } from "sonner";
import { reportError } from "@/lib/observe";
import appCss from "../styles.css?url";

const APP_NAME = "KidEase";
const ICON_VER = "13";
const APP_ICON = `/icon-512.png?v=${ICON_VER}`;

export const Route = createRootRoute({
  errorComponent: ({ error }) => {
    reportError(error, { route: typeof window !== "undefined" ? window.location.pathname : "root" });
    return (
    <div style={{ fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif", background: "#f6f3ee", color: "#1c2438", padding: 48, minHeight: "100vh" }}>
      <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase" }}>KidEase</p>
      <h1 style={{ fontSize: 28 }}>Something went wrong</h1>
      <p>Refresh the page, or go back to kidease.ca. If it keeps happening, email kyle@kidease.ca.</p>
      <p style={{ color: "#5c6578", fontSize: 13 }}>{error instanceof Error ? error.message : "Please try again."}</p>
    </div>
    );
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#1A3790" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "application-name", content: APP_NAME },
      {
        name: "description",
        content: "Find licensed childcare in Canada within a kilometre radius. Monthly fees, open spots, and enrolment in your pocket.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: `/favicon.svg?v=${ICON_VER}` },
      { rel: "icon", type: "image/png", sizes: "512x512", href: APP_ICON },
      { rel: "icon", type: "image/png", sizes: "192x192", href: APP_ICON },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: `/manifest.webmanifest?v=${ICON_VER}` },
      { rel: "apple-touch-icon", sizes: "180x180", href: APP_ICON },
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
      { rel: "preconnect", href: "https://maps.googleapis.com" },
      { rel: "preconnect", href: "https://maps.gstatic.com" },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" data-channel="website" data-runtime="web" suppressHydrationWarning>
      <head>
        <script src="/channel-boot.js" />
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <NativeBoot />
          <PostHogBoot />
          <RoleBoot />
          <Outlet />
          <Toaster position="top-center" richColors={false} />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
