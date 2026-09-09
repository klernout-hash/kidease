import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/how-it-works")({
  beforeLoad: () => {
    throw redirect({ to: "/fr", hash: "comment" });
  },
});
