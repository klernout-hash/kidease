import { createFileRoute } from "@tanstack/react-router";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { DailyFeedPage, dailyFeedHead } from "@/routes/parent.daily-feed";

export const Route = createFileRoute("/fr/parent/daily-feed")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  head: () => dailyFeedHead("fr"),
  component: DailyFeedPage,
});
