import { createFileRoute } from "@tanstack/react-router";
import { DailyFeedPage, dailyFeedHead } from "@/routes/parent.daily-feed";

export const Route = createFileRoute("/fr/parent/daily-feed")({
  head: () => dailyFeedHead("fr"),
  component: DailyFeedPage,
});
