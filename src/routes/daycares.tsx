import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/daycares")({
  beforeLoad: () => {
    throw redirect({ to: "/search" });
  },
});
