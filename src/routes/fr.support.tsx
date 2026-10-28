import { createFileRoute } from "@tanstack/react-router";
import { SupportPage, supportHead, supportValidateSearch } from "@/routes/support";
import { beforeLoadSupportDesk } from "@/lib/server/support-route";

export const Route = createFileRoute("/fr/support")({
  beforeLoad: () => beforeLoadSupportDesk("/fr/support"),
  head: supportHead,
  validateSearch: supportValidateSearch,
  component: SupportPage,
});
