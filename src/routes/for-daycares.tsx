import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/for-daycares")({
  beforeLoad: () => {
    throw redirect({ to: "/claim", statusCode: 301 });
  },
});
