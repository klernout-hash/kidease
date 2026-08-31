import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/meet-the-team")({
  beforeLoad: () => {
    throw redirect({ to: "/team" });
  },
});
