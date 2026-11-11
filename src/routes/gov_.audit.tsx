import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/audit")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/data" });
  },
});
