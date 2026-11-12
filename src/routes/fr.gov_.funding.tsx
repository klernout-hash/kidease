import { createFileRoute, redirect } from "@tanstack/react-router";
import { guardGovDesk } from "@/lib/gov/desk-guard";

export const Route = createFileRoute("/fr/gov_/funding")({
  beforeLoad: async ({ context }) => {
    await guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell));
    throw redirect({ href: "/fr/gov/reports?tab=funding" });
  },
});
