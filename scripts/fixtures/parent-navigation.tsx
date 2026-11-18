import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useParentNavigation } from "../../src/lib/use-parent-navigation";
import { useParentRequestScope } from "../../src/lib/use-parent-request-scope";
import { ParentHomeCare } from "../../src/components/parent-home-care";
import { dedupedQuery } from "../../src/lib/fn-query";
import type { Booking } from "../../src/lib/types";

// Explicit allowlist: this fixture has no account access, app transport or financial route.
const safeTabs = ["explore", "saved", "care"] as const;
type SafeTab = (typeof safeTabs)[number];
const listeners = new Set<() => void>();
let viewer: string | undefined = "synthetic-a";
let epoch = 0;
let sequence = 0;
const requests = new Map<
  number,
  {
    id: number;
    kind: string;
    viewer: string | undefined;
    input: unknown;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }
>();
const calls: Array<{ id: number; kind: string; viewer: string | undefined; input: unknown }> = [];
const navigations: string[] = [];
const events: string[] = [];
const gates = new Map<SafeTab, boolean>();
let expose: Record<string, unknown> = {};

function request(kind: string, input?: unknown) {
  const id = ++sequence;
  const metadata = { id, kind, viewer, input };
  calls.push(metadata);
  return new Promise((resolve, reject) => {
    requests.set(id, { ...metadata, resolve, reject });
  });
}
function account(next: string | undefined) {
  viewer = next;
  epoch += 1;
  listeners.forEach((listener) => listener());
}
const controls = {
  request,
  calls,
  navigations,
  events,
  pending: () =>
    [...requests.values()].map(({ resolve: _resolve, reject: _reject, ...metadata }) => metadata),
  resolve: (id: number, value?: unknown) => {
    const pending = requests.get(id);
    if (!pending) throw new Error(`No request ${id}`);
    requests.delete(id);
    pending.resolve(value);
  },
  reject: (id: number) => {
    const pending = requests.get(id);
    if (!pending) throw new Error(`No request ${id}`);
    requests.delete(id);
    pending.reject(new Error("Synthetic read failure"));
  },
  account,
  gate: (tab: SafeTab) => gates.set(tab, true),
  api: () => expose,
  history: () => router.history.location.href,
};
Object.assign(window, { parentNavigationFixture: controls });
Object.defineProperty(window.scheduler, "yield", {
  configurable: true,
  value: () => request("yield"),
});

export function Lifecycle({ initialTab }: { initialTab: SafeTab }) {
  const navigate = useCallback((tab: string) => {
    if (!safeTabs.includes(tab as SafeTab))
      throw new Error("Route is outside the nonfinancial allowlist");
    navigations.push(tab);
    void router.navigate({ to: "/parent", search: { tab: tab as SafeTab }, replace: true });
  }, []);
  const navigation = useParentNavigation(initialTab, navigate);
  const { issue, generation } = useParentRequestScope(viewer);
  const [result, setResult] = useState("none");
  const [mountResult, setMountResult] = useState("none");
  useEffect(() => {
    const token = issue("mount-family");
    void dedupedQuery(`fixture-family:${token.viewerId}`, 30_000, () => request("mount-family"), {
      fresh: true,
    }).then((value) => {
      if (token.isCurrent()) setMountResult(String(value));
    });
    return token.cancel;
  }, [issue]);
  const bookings = useMemo(
    () =>
      [
        {
          id: `booking-${viewer}`,
          status: "active",
          daycareId: "synthetic-centre",
          daycareName: "Synthetic centre",
          childName: viewer === "synthetic-a" ? "Synthetic Avery" : "Synthetic Quinn",
        },
      ] as Booking[],
    [],
  );
  useEffect(() => {
    expose = {
      select: navigation.selectTab,
      cachedResult: () =>
        dedupedQuery(`fixture-family:${viewer}`, 30_000, async () => "cache-miss"),
      homeRead: (kind: "boot" | "refresh") => {
        const operation = issue(kind);
        const family = issue("home-family");
        setResult("pending");
        void request("home-read", kind)
          .then((value) => {
            if (!family.isCurrent()) return;
            setResult(String(value));
          })
          .catch((error) => {
            if (!family.isCurrent()) return;
            throw error;
          })
          .catch(() => {
            if (operation.isCurrent()) setResult("error");
          });
      },
      read: (channel: string, continuation = false) => {
        const token = issue(channel);
        return request("data", { channel, generation })
          .then(async (value) => {
            if (!token.isCurrent()) return;
            if (continuation) {
              await request("continuation", { channel });
              if (!token.isCurrent()) return;
            }
            setResult(String(value));
            events.push(`accepted:${String(value)}`);
          })
          .catch(() => {
            if (token.isCurrent()) setResult("error");
          });
      },
      navigate: (tab: SafeTab) => router.navigate({ to: "/parent", search: { tab } }),
    };
  }, [navigation.selectTab, issue, generation]);
  return (
    <main
      data-viewer={viewer}
      data-active-tab={navigation.tab}
      data-content-tab={navigation.contentTab}
    >
      <h1>Synthetic parent navigation</h1>
      <nav aria-label="Synthetic parent navigation" className="fixture-controls">
        {safeTabs.map((tab) => (
          <button
            key={tab}
            data-tab={tab}
            type="button"
            aria-pressed={navigation.tab === tab}
            onClick={() => navigation.selectTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
      <output data-testid="highlight">{navigation.tab}</output>
      <section data-testid="panel">{navigation.contentTab}</section>
      <output data-testid="read-result">{result}</output>
      <output data-testid="mount-result">{mountResult}</output>
      {navigation.contentTab === "care" ? (
        <ParentHomeCare bookings={bookings} userId={viewer!} />
      ) : null}
    </main>
  );
}
export function ParentPage() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => epoch,
  );
  const { tab } = parentRoute.useSearch();
  return viewer ? (
    <Lifecycle key={viewer} initialTab={tab} />
  ) : (
    <main data-testid="signed-out">
      <h1>Signed out · synthetic fixture</h1>
      <p>No family content is shown.</p>
    </main>
  );
}
const root = createRootRoute({ component: Outlet });
const parentRoute = createRoute({
  getParentRoute: () => root,
  path: "/parent",
  validateSearch: (search: Record<string, unknown>) => {
    if (search.tab !== undefined && !safeTabs.includes(search.tab as SafeTab))
      throw new Error("Route is outside the nonfinancial allowlist");
    return { tab: (search.tab ?? "explore") as SafeTab };
  },
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ deps }) => {
    if (!gates.delete(deps.tab)) return {};
    return request("route", deps.tab);
  },
  component: ParentPage,
});
const router = createRouter({ routeTree: root.addChildren([parentRoute]), defaultPreload: false });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
