import { createFileRoute } from "@tanstack/react-router";
import { WelcomePage } from "@/routes/welcome.$code";

export const Route = createFileRoute("/fr/welcome/$code")({
  head: () => ({
    meta: [
      { title: "Une garderie a invité votre famille · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FrWelcomeRoute,
});

function FrWelcomeRoute() {
  const { code } = Route.useParams();
  return <WelcomePage code={code} />;
}

