import { createFileRoute } from "@tanstack/react-router";
import {
  ProviderPage,
  providerBeforeLoad,
  providerHead,
  providerValidateSearch,
} from "@/routes/provider";

export const Route = createFileRoute("/fr/provider")({
  beforeLoad: providerBeforeLoad,
  head: providerHead,
  validateSearch: providerValidateSearch,
  component: ProviderPage,
});
