import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/childcare-benefits-program")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/benefits" });
  },
});