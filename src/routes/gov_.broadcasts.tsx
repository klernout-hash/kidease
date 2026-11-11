import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/broadcasts")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/data" });
  },
});
