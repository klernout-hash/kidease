import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pay")({
  head: () => ({
    meta: [
      { title: "Pay a centre bill · KidEase" },
      { name: "description", content: "Pay a bill your daycare sent. Search stays separate from centre bills." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PayLayout,
});

/** Layout only: booking `/pay/$id` and bill `/pay/bill/$id` stay the real pay desks. */
function PayLayout() {
  return <Outlet />;
}
