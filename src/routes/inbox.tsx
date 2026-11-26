import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { parentNavSearch } from "@/lib/desk-nav";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { CentreInboxDesk } from "@/components/centre-inbox";
import { DeskShell } from "@/components/desk-shell";
import { InboxList } from "@/components/inbox-list";
import { useSessionDesks } from "@/components/session-desks";
import { parseInboxSearch, resolveInboxView } from "@/lib/inbox-view";
import { useRoleChrome } from "@/components/role-chrome";
import { useCopy } from "@/lib/use-copy";
import { RuntimePaused } from "@/components/runtime-paused";
import { useRuntimeSwitches } from "@/lib/use-runtime-switches";
import { cn } from "@/lib/utils";

export const inboxBeforeLoad = ({
  context,
  location,
}: {
  context: { roleChrome?: Parameters<typeof beforeLoadPrivate>[1] };
  location: { pathname: string; href?: string; searchStr?: string };
}) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome);

export const inboxValidateSearch = (s: Record<string, unknown>) => parseInboxSearch(s);

export function inboxHead({
  match,
}: {
  match: { pathname?: string; search: { view?: string } };
}) {
  const french = String(match.pathname || "").startsWith("/fr");
  const family = match.search.view === "family";
  const title = french
    ? family
      ? "Messages de la famille · KidEase"
      : "Messages · KidEase"
    : family
      ? "Family messages · KidEase"
      : "Messages · KidEase";
  return {
    meta: [
      { title },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

export function InboxDesk({
  pathname,
  search,
  listPath,
  onParent,
}: {
  pathname: string;
  search: ReturnType<typeof parseInboxSearch>;
  listPath: "/inbox" | "/fr/inbox";
  onParent: (id: string) => void;
}) {
  const { t } = useCopy();
  const inboxOn = useRuntimeSwitches().inbox;
  const { sticky } = useSessionDesks();
  const chrome = useRoleChrome();
  const forced = chrome.role === "provider" ? "centre" : chrome.role === "parent" ? "family" : null;
  const view = forced ?? resolveInboxView({ search: search.view, sticky });
  const threadPrefix = `${listPath}/`;
  const selectedId = pathname.startsWith(threadPrefix)
    ? decodeURIComponent(pathname.slice(threadPrefix.length).split("/")[0] || "")
    : undefined;
  const onThread = Boolean(selectedId);
  if (!inboxOn) {
    return (
      <DeskShell desk={view === "centre" ? "daycare" : "parent"} active="messages" onSelect={() => undefined}>
        <RuntimePaused id="inbox" />
      </DeskShell>
    );
  }
  if (view === "centre") {
    return (
      <CentreInboxDesk
        selectedId={selectedId || undefined}
        openDetail={Boolean(search.detail || search.tour)}
      />
    );
  }
  const split = (
    <DeskShell
      desk="parent"
      active="messages"
      // An open thread owns the viewport like the daycare inbox: no site footer
      // (its links and store badges sat on top of the bubbles, B03a).
      fitViewport={onThread}
      onSelect={(id) => {
        if (id === "messages") return;
        onParent(id);
      }}
    >
      <div
        className={cn("ke-split", onThread && "min-h-0 flex-1 [[data-channel=app]_&]:grid-rows-[minmax(0,1fr)] [[data-channel=app]_&]:items-stretch")}
        data-ke="inbox-split"
        data-selected={onThread ? "true" : "false"}
      >
        {/* On the website an open thread is the whole pane at every width; below 1280px the list used to stack above it. */}
        <div className={cn("ke-split-list min-w-0", onThread && "max-h-full overflow-y-auto [[data-channel=website]_&]:hidden")}>
          <InboxList bare />
        </div>
        <div className={cn("ke-split-detail min-w-0", onThread && "flex h-full min-h-0 flex-col")} data-ke="inbox-detail">
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
  return split;
}

export const Route = createFileRoute("/inbox")({
  beforeLoad: inboxBeforeLoad,
  validateSearch: inboxValidateSearch,
  head: inboxHead,
  component: InboxLayout,
});

function InboxLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <InboxDesk
      pathname={pathname}
      search={search}
      listPath="/inbox"
      onParent={(id) => {
        void navigate({ to: "/parent", search: parentNavSearch(id) });
      }}
    />
  );
}
