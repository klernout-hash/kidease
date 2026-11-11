import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/gov_/exports")({
  beforeLoad: () => {
    throw redirect({ href: "/fr/gov/data" });
  },
});
