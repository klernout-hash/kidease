import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/claim-notices")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
