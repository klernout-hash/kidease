import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/exports")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/data" });
  },
});
