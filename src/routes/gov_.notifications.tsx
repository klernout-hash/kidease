import { createFileRoute, redirect } from "@tanstack/react-router";
import { guardGovDesk } from "@/lib/gov/desk-guard";

export const Route = createFileRoute("/gov_/notifications")({
  beforeLoad: async ({ context }) => {
    await guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell));
    throw redirect({ href: "/gov" });
  },
});
