import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/pricing")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/plans", statusCode: 301 });
  },
});
