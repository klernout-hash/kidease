import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPlansGate } from "@/lib/server/ui-chrome";

export const Route = createFileRoute("/pricing")({
  loader: async () => {
    const gate = await getPlansGate();
    if (!gate.plansOpen) throw redirect({ to: "/" });
    throw redirect({ to: "/plans", statusCode: 301 });
  },
});
