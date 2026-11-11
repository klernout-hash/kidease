import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
// @ts-expect-error JS helper alongside the TS vite config
import { googleMapsBrowserKey } from "./scripts/google-maps-client-key.mjs";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { wellKnownAppLinksPlugin } from "./scripts/well-known-app-links.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { clientNodeBuiltinStub } from "./scripts/client-node-stub.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { routeUiSplitPlugin } from "./scripts/route-ui-split.mjs";

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

/**
 * Live-preview OAuth popup — handled HERE so the agent never has to create a
 * `/auth/popup` route (and cannot break it by scaffolding a React page that
 * paints the full app shell in the popup).
 *
 * `signIn` (client.ts) opens `/auth/popup?providerId=…` in a top-level window.
 * This middleware runs before TanStack Start, calls `handleAuthPopupRequest`,
 * and returns the 302 / completion HTML. Deployed apps do not use the popup
 * (full-page OAuth redirect), so `apply: "serve"` is enough.
 */
/**
 * Dev-only `/ingest` reverse proxy. Production uses vercel.json rewrites;
 * `vite preview` uses server/middleware/ingest-proxy.ts.
 */
function posthogIngestPlugin(): Plugin {
  return {
    name: "app-builder:posthog-ingest",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathOnly = rawUrl.split("?", 1)[0] ?? "";
        if (pathOnly !== "/ingest" && !pathOnly.startsWith("/ingest/")) {
          next();
          return;
        }
        try {
          const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080");
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) requestHeaders.append(key, v);
            } else {
              requestHeaders.set(key, value);
            }
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(`${proto}://${host}${rawUrl}`, {
            method: (req.method ?? "GET").toUpperCase(),
            headers: requestHeaders,
            body: body && (req.method ?? "GET") !== "GET" && (req.method ?? "GET") !== "HEAD" ? body : undefined,
          });
          const mod = (await server.ssrLoadModule("/src/lib/server/posthog-proxy.ts")) as {
            proxyPosthogRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.proxyPosthogRequest(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          const setCookies =
            typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
          for (const cookie of setCookies) res.appendHeader("set-cookie", cookie);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error("[app-builder] /ingest proxy failed:", err);
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("ingest proxy failed");
          }
        }
      });
    },
  };
}

function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      // Register immediately (not in a returned post-hook) so we run BEFORE
      // TanStack Start / the SPA HTML fallback. A model-authored
      // `src/routes/auth/popup.tsx` React page must never win this path.
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          const pathOnly = rawUrl.split("?", 1)[0] ?? "";
          if (pathOnly !== "/auth/popup") {
            next();
            return;
          }
          if ((req.method ?? "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }

          const host = String(
            req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080",
          );
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) requestHeaders.append(key, v);
            } else {
              requestHeaders.set(key, value);
            }
          }
          // Ensure Host is the public preview host so Better Auth's dynamic
          // baseURL / redirect_uri match the popup origin.
          if (!requestHeaders.has("host")) requestHeaders.set("host", host);

          const request = new Request(`${proto}://${host}${rawUrl}`, {
            method: "GET",
            headers: requestHeaders,
          });

          const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);

          res.statusCode = response.status;
          // Preserve multiple Set-Cookie headers (OAuth state + session).
          const setCookies =
            typeof response.headers.getSetCookie === "function"
              ? response.headers.getSetCookie()
              : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          for (const cookie of setCookies) {
            res.appendHeader("set-cookie", cookie);
          }
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          console.error("[app-builder] /auth/popup handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

/**
 * Vite copies every VITE_* value into client chunks that read import.meta.env.
 * Blank the Maps key unless this build's map provider is Google (the default).
 */
function gateGoogleMapsClientKey(browserKey: string): Plugin {
  return {
    name: "kidease:gate-google-maps-key",
    configResolved(config) {
      const apply = (env: Record<string, string> | undefined) => {
        if (!env) return;
        if (!browserKey) delete env.VITE_GOOGLE_MAPS_API_KEY;
        else env.VITE_GOOGLE_MAPS_API_KEY = browserKey;
      };
      apply(config.env);
      const environments = (config as { environments?: Record<string, { config?: { env?: Record<string, string> } }> }).environments;
      if (!environments) return;
      for (const environment of Object.values(environments)) apply(environment.config?.env);
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The Grok preview proxy forwards with Host like `<sandbox>-8080-fuocs`.
// Vite 6+ blocks unknown hosts by default (403 → "Preview not available").
/**
 * twilio-video's util/dynamicimport.js builds `Function("url","return import(url)")`
 * at module load. Our CSP has no 'unsafe-eval', so that throws and the whole SDK
 * fails to load ("Could not start the video room"). It is only used for optional
 * plugins (Krisp noise cancellation) we don't ship, so swap in a CSP-safe stub.
 */
function twilioVideoCspSafe(): Plugin {
  return {
    name: "kidease:twilio-video-csp-safe",
    enforce: "pre",
    transform(_code, id) {
      if (!/twilio-video[\\/]es5[\\/]util[\\/]dynamicimport\.js$/.test(id.split("?")[0])) return null;
      return {
        code: "module.exports = function () { return function (url) { return Promise.reject(new Error('Failed to import: ' + url + ': dynamicImport is disabled')); }; }();\n",
        map: null,
      };
    },
  };
}

export default defineConfig(({ command, isPreview, mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const mapsBrowserKey = googleMapsBrowserKey({ ...fileEnv, ...process.env });
  return {
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    hmr: {
      overlay: false,
    },
    // 1Password Environments mounts `.env` as a FIFO. Watching it restarts
    // Vite in a loop. Names-only — see docs/1password-environments.md
    watch: {
      ignored: ["**/.env", "**/.env.local", "**/.env.*.local"],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
    allowedHosts: true,
  },
  resolve: { tsconfigPaths: true },
  // POSTHOG_HOST is a public ingest URL (already on Vercel). Narrow prefix so
  // a future POSTHOG_* / SENTRY_DSN secret is not inlined into the client bundle.
  // Browser Sentry reads VITE_PUBLIC_SENTRY_DSN only.
  envPrefix: ["VITE_", "POSTHOG_HOST", "NEXT_PUBLIC_AMAZON_APPSTORE_URL", "NEXT_PUBLIC_MAP_PROVIDER"],
  // Only the enabled build receives the key. An empty define would still
  // leave the name in every chunk that reads import.meta.env.
  ...(mapsBrowserKey
    ? { define: { "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify(mapsBrowserKey) } }
    : {}),
  build: {
    sourcemap: Boolean(process.env.POSTHOG_CLI_API_KEY || process.env.POSTHOG_PERSONAL_API_KEY),
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // Keep "posthog" out of the public chunk URL. Blockers that match
              // that name fail the shell import and asset-recover reloads forever.
              name: "product-events",
              test: /src\/lib\/posthog\.ts$/,
              minSize: 0,
              minShareCount: 1,
            },
            {
              name: "product-events-lib",
              test: /node_modules\/posthog-js/,
              minSize: 0,
              minShareCount: 1,
            },
            {
              // Shared with the header. Must not be folded into the fee-list chunk.
              name: "facility-type",
              test: /src\/lib\/facility-type\.ts$/,
              minSize: 0,
              minShareCount: 1,
            },
            {
              name: "care-type",
              test: /src\/lib\/care-type\.ts$/,
              minSize: 0,
              minShareCount: 1,
            },
            {
              name: "search-start",
              test: /src\/lib\/search-start\.ts$/,
              minSize: 0,
              minShareCount: 1,
            },
            ...(["zh", "yue", "pa", "es", "ar", "tl", "it", "de"] as const).map((code) => ({
            name: `locale-${code}`,
            test: new RegExp(`/src/lib/i18n/${code}\\.json$`),
            minSize: 0,
            minShareCount: 1,
          })),
          ],
        },
      },
    },
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter(
          (dep) =>
            !/locale-(?:zh|yue|pa|es|ar|tl|it|de)/.test(dep) &&
            !/posthog|product-events/i.test(dep) &&
            !/vacancy-index/i.test(dep) &&
            !/gov-admin/i.test(dep),
        );
      },
    },
  },
  // Vite 8 replaces `process.env` with {} when keepProcessEnv is false (client
  // or worker). Nitro / TanStack Start server functions must see Vercel runtime
  // secrets, including Sensitive keys that were absent from the build snapshot.
  environments: {
    ssr: { keepProcessEnv: true },
    server: { keepProcessEnv: true },
    nitro: { keepProcessEnv: true },
  },
  ssr: { external: ["sharp", "posthog-js", "@sentry/node", "inngest"] },
  optimizeDeps: { exclude: ["sharp"] },
  plugins: [
    twilioVideoCspSafe(),
    gateGoogleMapsClientKey(mapsBrowserKey),
    clientNodeBuiltinStub(),
    pgliteBootstrapPlugin(),
    // Before tanstackStart so AASA / assetlinks never fall through to the SPA.
    wellKnownAppLinksPlugin(),
    // Before tanstackStart so /auth/popup never falls through to the SPA.
    authPopupPlugin(),
    posthogIngestPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    // Before Start so route screens are local functions when the code splitter runs.
    routeUiSplitPlugin(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
            // Vite 8.2 + Rolldown 1.2.x + nitro 3.0.260610-beta splits the
            // SSR service into mutually-importing chunks and re-exports an
            // undeclared `ssr_exports` binding. Node then throws
            // `SyntaxError: Export 'ssr_exports' is not defined in module`
            // on compileSourceTextModule — every request 500s (GET /,
            // /api/auth/get-session, POST /_serverFn/…) while `vite build`
            // still exits 0. Inlining the SSR graph keeps the namespace in
            // the same module. Remove once Rolldown #10734 / Start #8031
            // ship a real fix.
            // @see https://github.com/TanStack/router/issues/8031
            // @see https://github.com/nitrojs/nitro/issues/4533
            inlineDynamicImports: true,
          }),
        ]
      : []),
    viteReact(),
  ],
};
});
