import { useRouterState } from "@tanstack/react-router";

/** Thin bar while a page is changing. Not a full-screen loader. */
export function RouteProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  if (!pending) return null;
  return <div className="ke-route-progress" role="status" aria-label="Loading" data-ke="route-progress" />;
}
