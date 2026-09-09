import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pay")({
  component: PayLayout,
});

/** Layout only — booking `/pay/$id` and bill `/pay/bill/$id` stay the real pay desks. */
function PayLayout() {
  return <Outlet />;
}
