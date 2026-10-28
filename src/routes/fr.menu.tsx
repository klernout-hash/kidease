import { createFileRoute } from "@tanstack/react-router";
import { MenuPage, menuHead, menuLoader, menuValidateSearch } from "@/routes/menu";

export const Route = createFileRoute("/fr/menu")({
  validateSearch: menuValidateSearch,
  loaderDeps: ({ search }) => ({ screen: search.screen }),
  loader: menuLoader,
  head: menuHead,
  component: MenuPage,
});
