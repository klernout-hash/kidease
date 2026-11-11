import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/notifications")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
