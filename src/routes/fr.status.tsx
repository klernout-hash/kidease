import { createFileRoute } from "@tanstack/react-router";
import { StatusPage, statusHead, statusLoader } from "@/routes/status";

export const Route = createFileRoute("/fr/status")({
  loader: () => statusLoader(),
  head: () => statusHead("fr"),
  component: FrenchStatusPage,
});

function FrenchStatusPage() {
  const data = Route.useLoaderData();
  return <StatusPage health={data.health} checkedAt={data.checkedAt} />;
}
