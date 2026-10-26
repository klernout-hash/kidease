import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { parentNavSearch } from "@/lib/desk-nav";
import { InboxDesk, inboxBeforeLoad, inboxHead, inboxValidateSearch } from "@/routes/inbox";

export const Route = createFileRoute("/fr/inbox")({
  beforeLoad: inboxBeforeLoad,
  validateSearch: inboxValidateSearch,
  head: inboxHead,
  component: FrInboxPage,
});

function FrInboxPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <InboxDesk
      pathname={pathname}
      search={search}
      listPath="/fr/inbox"
      onParent={(id) => {
        void navigate({ to: "/fr/parent", search: parentNavSearch(id) });
      }}
    />
  );
}
