import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/parent_/absence")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/parent", search: { tab: "care" }, replace: true });
  },
});
