import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/parent")({
  beforeLoad: () => {
    throw redirect({ to: "/login", search: { role: "parent" } });
  },
});
