import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { InboxList } from "@/components/inbox-list";

export const Route = createFileRoute("/inbox")({ component: InboxLayout });

function InboxLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/inbox") return <Outlet />;
  return <InboxList />;
}
