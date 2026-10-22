import { createFileRoute } from "@tanstack/react-router";
import { ReferLanding } from "@/components/refer-landing";

export const Route = createFileRoute("/r/$code")({
  head: () => ({
    meta: [
      { title: "A friend shared KidEase" },
      { name: "description", content: "Search licensed daycares in Canada. KidEase does not pay for sharing." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReferRoute,
});

function ReferRoute() {
  const { code } = Route.useParams();
  return <ReferLanding code={code} />;
}
