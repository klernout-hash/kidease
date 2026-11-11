import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/gov_/complaints")({
  beforeLoad: () => {
    throw redirect({ href: "/fr/gov/reports?tab=complaints" });
  },
});
