import { createFileRoute, redirect } from "@tanstack/react-router";

/** Dead `/fr/daycares` hub → French search. */
export const Route = createFileRoute("/fr/daycares")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/search" });
  },
});
