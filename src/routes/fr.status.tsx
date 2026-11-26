import { createFileRoute } from "@tanstack/react-router";
import { loadPublicStatusWithLabels, StatusPage, statusHead } from "@/routes/status";

export const Route = createFileRoute("/fr/status")({
  loader: () => loadPublicStatusWithLabels(),
  head: () => statusHead("fr"),
  component: FrenchStatusPage,
});

function FrenchStatusPage() {
  const data = Route.useLoaderData();
  return <StatusPage health={data.health} checkedAt={data.checkedAt} checkedLabel={data.checkedLabel} />;
}
