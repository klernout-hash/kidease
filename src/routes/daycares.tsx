import { createFileRoute, redirect } from "@tanstack/react-router";

/** Dead `/daycares` hub → working search. */
export const Route = createFileRoute("/daycares")({
  beforeLoad: () => {
    throw redirect({ to: "/search" });
  },
});
