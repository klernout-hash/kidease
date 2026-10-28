import { createFileRoute } from "@tanstack/react-router";
import { loadPublicStatus } from "@/lib/server/status-page";
import { StatusPage, statusHead } from "@/routes/status";

export const Route = createFileRoute("/fr/status")({
  loader: () => loadPublicStatus(),
  head: () => statusHead("fr"),
  component: FrenchStatusPage,
});

function FrenchStatusPage() {
  const data = Route.useLoaderData();
  return <StatusPage health={data.health} checkedAt={data.checkedAt} />;
}
