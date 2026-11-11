import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/compliance")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/expiries" });
  },
});
