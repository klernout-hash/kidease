import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/for-daycares")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/claim", statusCode: 301 });
  },
});
