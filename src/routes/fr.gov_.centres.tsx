import { createFileRoute, redirect } from "@tanstack/react-router";
import { guardGovDesk } from "@/lib/gov/desk-guard";
import { govLegacyHref } from "@/lib/gov/legacy";

export const Route = createFileRoute("/fr/gov_/centres")({
  beforeLoad: async ({ context }) => {
    await guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell));
    throw redirect({ href: govLegacyHref("fr", "centres") });
  },
});
