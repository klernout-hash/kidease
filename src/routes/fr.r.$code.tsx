import { createFileRoute } from "@tanstack/react-router";
import { ReferLanding } from "@/components/refer-landing";

export const Route = createFileRoute("/fr/r/$code")({
  head: () => ({
    meta: [
      { title: "Un ami a partagé KidEase" },
      { name: "description", content: "Cherchez des garderies permises au Canada. KidEase ne paie pas pour le partage." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReferRouteFr,
});

function ReferRouteFr() {
  const { code } = Route.useParams();
  return <ReferLanding code={code} />;
}
