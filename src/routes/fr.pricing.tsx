import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPlansGate } from "@/lib/server/ui-chrome";

export const Route = createFileRoute("/fr/pricing")({
  loader: async () => {
    const gate = await getPlansGate();
    if (!gate.plansOpen) throw redirect({ to: "/fr" });
    throw redirect({ to: "/fr/plans", statusCode: 301 });
  },
});
