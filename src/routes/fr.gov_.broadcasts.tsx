import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/gov_/broadcasts")({
  beforeLoad: () => {
    throw redirect({ href: "/fr/gov/data" });
  },
});
