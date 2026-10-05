import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/login", search: { intent: "up" }, statusCode: 301 });
  },
});
