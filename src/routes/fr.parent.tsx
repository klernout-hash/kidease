import { createFileRoute } from "@tanstack/react-router";
import {
  ParentDeskPage,
  parentBeforeLoad,
  parentHead,
  parentLoader,
  parentValidateSearch,
} from "@/routes/parent";

export const Route = createFileRoute("/fr/parent")({
  beforeLoad: parentBeforeLoad,
  head: parentHead,
  loader: parentLoader,
  validateSearch: parentValidateSearch,
  component: FrParentPage,
});

function FrParentPage() {
  return <ParentDeskPage search={Route.useSearch()} loaded={Route.useLoaderData()} />;
}
