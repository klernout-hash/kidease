import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/components/security-page";

export const Route = createFileRoute("/fr/security")({
  component: () => <SecurityPage locale="fr" />,
});
