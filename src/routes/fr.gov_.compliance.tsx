import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/gov_/compliance")({
  beforeLoad: () => {
    throw redirect({ href: "/fr/gov/expiries" });
  },
});
