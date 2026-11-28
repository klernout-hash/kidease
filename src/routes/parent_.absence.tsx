import { createFileRoute, redirect } from "@tanstack/react-router";
import { keepLangParam } from "@/lib/locale-search";

export const Route = createFileRoute("/parent_/absence")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/parent",
      search: { ...keepLangParam(location.search, {}), tab: "care" },
      replace: true,
    });
  },
});
