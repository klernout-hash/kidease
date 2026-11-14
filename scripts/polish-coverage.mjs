/** Shared, explicit coverage for the local performance and layout audit. */
import { readFileSync } from "node:fs";
export const POLISH_WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
export const POLISH_SCREENSHOT_WIDTHS = [360, 390, 768, 1280, 1440];
const REPRESENTATIVE_PAGES = [
  { id: "home", path: "/", tier: "core" },
  { id: "search", path: "/search", tier: "core" },
  { id: "listing", path: "/daycare/{slug}", tier: "core", requiresSlug: true },
  { id: "login", path: "/login", tier: "core" },
  { id: "signup", path: "/signup", tier: "public" },
  { id: "forgot-password", path: "/forgot-password", tier: "public" },
  { id: "about", path: "/about", tier: "public" },
  { id: "benefits", path: "/benefits", tier: "public" },
  { id: "how-it-works", path: "/how-it-works", tier: "public" },
  { id: "for-daycares", path: "/for-daycares", tier: "public" },
  { id: "daycares", path: "/daycares", tier: "public" },
  { id: "claim", path: "/claim", tier: "public" },
  { id: "help", path: "/help", tier: "public" },
  { id: "faq", path: "/faq", tier: "public" },
  { id: "contact", path: "/contact", tier: "public" },
  { id: "get-app", path: "/get-app", tier: "public" },
  { id: "guides", path: "/guides", tier: "public" },
  { id: "privacy", path: "/privacy", tier: "public" },
  { id: "terms", path: "/terms", tier: "public" },
  { id: "cookies", path: "/cookies", tier: "public" },
  { id: "security", path: "/security", tier: "public" },
  { id: "team", path: "/team", tier: "public" },
  { id: "parent", path: "/parent", tier: "desk", role: "parent" },
  { id: "daycare", path: "/provider", tier: "desk", role: "provider" },
  {
    id: "org",
    path: "/provider?desk=sites",
    tier: "desk",
    role: "provider",
    gate: "Existing organization feature flag and memberships apply.",
  },
  {
    id: "staff",
    path: "/provider?desk=staff",
    tier: "desk",
    role: "provider",
    gate: "Existing staff feature flag applies.",
  },
  { id: "admin", path: "/admin", tier: "desk", role: "admin" },
  {
    id: "government",
    path: "/gov",
    tier: "desk",
    role: "government",
    gate: "Existing government visibility and access gates apply.",
  },
];

// Read the literal sitemap inventory without importing server/application code.
const sitemapSource = readFileSync(new URL("../src/lib/sitemap.ts", import.meta.url), "utf8");
const staticLiteral = sitemapSource.match(
  /export const SITEMAP_STATIC_PATHS = \[([\s\S]*?)\] as const;/,
)?.[1];
if (!staticLiteral)
  throw new Error(
    "Canonical static sitemap inventory could not be read; do not silently reduce public coverage.",
  );
export const POLISH_SITEMAP_PATHS = Array.from(
  staticLiteral.matchAll(/"([^"]+)"/g),
  (match) => match[1],
);
const knownPaths = new Set(REPRESENTATIVE_PAGES.map((page) => page.path));
export const POLISH_PAGES = [
  ...REPRESENTATIVE_PAGES,
  ...POLISH_SITEMAP_PATHS.filter((path) => !knownPaths.has(path)).map((path) => ({
    id: path.slice(1).replaceAll("/", "-"),
    path,
    tier: "public",
    source: "canonical static sitemap",
    ...(path === "/status"
      ? {
          safetyBlock:
            "Status loader invokes the same health collector excluded from this audit; no request was sent.",
        }
      : {}),
  })),
];

export function localAuditUrl(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      "Polish audits require an HTTP loopback server; external overrides are intentionally unsupported.",
    );
  }
  if (url.username || url.password)
    throw new Error("Credentials in the audit URL are unsupported.");
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("Pass only the loopback origin as --base.");
  return url.origin;
}

export function polishPath(page, locale, slug) {
  if (page.requiresSlug && !/^[a-z0-9-]+$/.test(slug || ""))
    throw new Error("A local catalog listing slug is required.");
  const path = page.path.replace("{slug}", slug || "");
  // Admin is one shared route whose language comes from its search parameter.
  if (locale === "fr" && page.id === "admin")
    return `${path}${path.includes("?") ? "&" : "?"}lang=fr`;
  return locale === "fr" ? `/fr${path === "/" ? "" : path}` : path;
}

export function polishProfiles(mode) {
  const normal = (width) => ({
    id: `${width}-portrait`,
    width,
    height: width < 768 ? Math.max(740, Math.round(width * 2.16)) : Math.round(width * 0.75),
    look: "classic",
    theme: "light",
    textScale: "md",
    reflowZoom: 1,
  });
  if (mode === "quick") return [normal(390), normal(1280)];
  const screenshots = POLISH_SCREENSHOT_WIDTHS.map(normal);
  const appearance = [390, 1280].flatMap((width) =>
    ["classic", "clean"].flatMap((look) =>
      ["light", "dark"].map((theme) => ({
        ...normal(width),
        id: `${width}-${look}-${theme}`,
        look,
        theme,
      })),
    ),
  );
  if (mode === "screenshots")
    return [
      ...screenshots,
      ...appearance.filter((p) => p.look !== "classic" || p.theme !== "light"),
    ];
  if (!["matrix", "all"].includes(mode)) throw new Error(`Unknown audit mode: ${mode}`);
  const matrix = POLISH_WIDTHS.flatMap((width) => {
    const portrait = normal(width);
    return [
      portrait,
      { ...portrait, id: `${width}-landscape`, width: portrait.height, height: width },
    ];
  });
  // A half-width CSS viewport models the reflow caused by desktop 200% zoom.
  // It is not a physical device or a browser UI zoom test.
  const largeText = POLISH_WIDTHS.map((width) => ({
    ...normal(width),
    id: `${width}-large-text`,
    textScale: "xl",
  }));
  const zoom = POLISH_WIDTHS.map((width) => ({
    ...normal(width),
    id: `${width}-zoom-reflow-200`,
    width: Math.round(width / 2),
    height: Math.round(normal(width).height / 2),
    physicalWidth: width,
    reflowZoom: 2,
  }));
  return [
    ...matrix,
    ...largeText,
    ...zoom,
    ...appearance.filter((p) => p.look !== "classic" || p.theme !== "light"),
  ];
}
