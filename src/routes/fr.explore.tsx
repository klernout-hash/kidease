import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/explore")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/search" });
  },
});
