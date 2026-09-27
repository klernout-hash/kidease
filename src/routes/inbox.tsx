import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { CentreInboxDesk } from "@/components/centre-inbox";
import { InboxList } from "@/components/inbox-list";
import { useSessionDesks } from "@/components/session-desks";
import { parseInboxSearch, resolveInboxView } from "@/lib/inbox-view";
import { useRoleChrome } from "@/components/role-chrome";

export const Route = createFileRoute("/inbox")({
  beforeLoad: ({ location }) => beforeLoadPrivate(location.pathname || "/inbox"),
  validateSearch: (s: Record<string, unknown>) => parseInboxSearch(s),
  component: InboxLayout,
});

function InboxLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = Route.useSearch();
  const { sticky } = useSessionDesks();
  const chrome = useRoleChrome();
  const forced = chrome.role === "provider" ? "centre" : chrome.role === "parent" ? "family" : null;
  const view = forced ?? resolveInboxView({ search: search.view, sticky });
  const selectedId = pathname.startsWith("/inbox/") ? decodeURIComponent(pathname.slice("/inbox/".length).split("/")[0] || "") : undefined;
  if (view === "centre") {
    return (
      <CentreInboxDesk
        selectedId={selectedId || undefined}
        openDetail={Boolean(search.detail || search.tour)}
      />
    );
  }
  if (pathname !== "/inbox") return <Outlet />;
  return <InboxList />;
}
