import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { InboxList } from "@/components/inbox-list";
import { parseInboxView } from "@/lib/inbox-view";

export const Route = createFileRoute("/inbox")({
  validateSearch: (s: Record<string, unknown>) => {
    const view = parseInboxView(s.view);
    return view ? { view } : {};
  },
  component: InboxLayout,
});

function InboxLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/inbox") return <Outlet />;
  return <InboxList />;
}
