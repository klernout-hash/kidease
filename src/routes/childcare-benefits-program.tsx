import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/childcare-benefits-program")({
  beforeLoad: () => {
    throw redirect({ to: "/benefits" });
  },
});
