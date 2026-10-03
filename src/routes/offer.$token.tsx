import { createFileRoute } from "@tanstack/react-router";
import { SpotOfferLink } from "@/components/spot-offer-link";

export const Route = createFileRoute("/offer/$token")({
  head: () => ({
    meta: [
      { title: "Spot offer · KidEase" },
      {
        name: "description",
        content: "Answer a daycare spot offer on KidEase. You have 48 hours. There is no waitlist fee.",
      },
    ],
  }),
  component: OfferTokenPage,
});

function OfferTokenPage() {
  const { token } = Route.useParams();
  return <SpotOfferLink token={token} />;
}
