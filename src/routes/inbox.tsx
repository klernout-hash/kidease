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

export const inboxBeforeLoad = ({
  context,
  location,
}: {
  context: { roleChrome?: Parameters<typeof beforeLoadPrivate>[1] };
  location: { pathname: string; href?: string; searchStr?: string };
}) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome);

export const inboxValidateSearch = (s: Record<string, unknown>) => parseInboxSearch(s);

export function inboxHead({ match }: { match: { search: { view?: string } } }) {
  return {
    meta: [
      { title: match.search.view === "family" ? "Family messages · KidEase" : "Messages · KidEase" },
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
  const { sticky } = useSessionDesks();
  const chrome = useRoleChrome();
  const forced = chrome.role === "provider" ? "centre" : chrome.role === "parent" ? "family" : null;
  const view = forced ?? resolveInboxView({ search: search.view, sticky });
  const threadPrefix = `${listPath}/`;
  const selectedId = pathname.startsWith(threadPrefix)
    ? decodeURIComponent(pathname.slice(threadPrefix.length).split("/")[0] || "")
    : undefined;
  const onList = pathname === listPath;
  if (view === "centre") {
    return (
      <CentreInboxDesk
        selectedId={selectedId || undefined}
        openDetail={Boolean(search.detail || search.tour)}
      />
    );
  }
  const onThread = Boolean(selectedId);
  const split = (
    <DeskShell
      desk="parent"
      active="messages"
      onSelect={(id) => {
        if (id === "messages") return;
        onParent(id);
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
  return (
    <>
      <div className="ke-site-desktop">{onList ? <InboxList /> : <Outlet />}</div>
      <div className="ke-site-compact">{split}</div>
    </>
  );
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
