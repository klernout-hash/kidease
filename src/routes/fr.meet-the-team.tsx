import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/meet-the-team")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/team" });
  },
});
