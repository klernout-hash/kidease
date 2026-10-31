import { createFileRoute } from "@tanstack/react-router";
import { ForYouPage } from "@/routes/for-you";
import { loadMyFeedPrefs } from "@/lib/server/home-feed";

export const Route = createFileRoute("/fr/for-you")({
  loader: () => loadMyFeedPrefs().catch(() => ({ enabled: false as const, prefs: null })),
  head: () => ({
    meta: [
      { title: "Pour vous · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FrenchForYou,
});

function FrenchForYou() {
  return <ForYouPage initial={Route.useLoaderData()} />;
}
