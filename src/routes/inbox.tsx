import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { CentreInboxDesk } from "@/components/centre-inbox";
import { DeskShell } from "@/components/desk-shell";
import { InboxList } from "@/components/inbox-list";
import { useSessionDesks } from "@/components/session-desks";
import { parseInboxSearch, resolveInboxView } from "@/lib/inbox-view";
import { useRoleChrome } from "@/components/role-chrome";
import { parentNavSearch } from "@/lib/desk-nav";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/inbox")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  validateSearch: (s: Record<string, unknown>) => parseInboxSearch(s),
  head: ({ match }) => ({
    meta: [
      { title: match.search.view === "family" ? "Family messages · KidEase" : "Messages · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InboxLayout,
});

function InboxLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useCopy();
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
  const onThread = Boolean(selectedId);
  return (
    <DeskShell
      desk="parent"
      active="messages"
      onSelect={(id) => {
        if (id === "messages") return;
        void navigate({ to: "/parent", search: parentNavSearch(id) });
      }}
    >
      <div className="ke-split" data-ke="inbox-split" data-selected={onThread ? "true" : "false"}>
        <div className="ke-split-list min-w-0">
          <InboxList bare />
        </div>
        <div className="ke-split-detail min-w-0" data-ke="inbox-detail">
          {onThread ? (
            <Outlet />
          ) : (
            <div className="rounded-xl bg-surface p-6 ring-1 ring-border">
              <p className="font-display text-xl">{t("inboxPickThread")}</p>
              <p className="mt-1 text-sm text-muted">{t("inboxPickThreadLead")}</p>
            </div>
          )}
        </div>
      </div>
    </DeskShell>
  );
}
