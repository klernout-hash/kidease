import { createFileRoute } from "@tanstack/react-router";
import { MySpotOffers } from "@/components/my-spot-offers";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";

export const Route = createFileRoute("/parent/spot-offers")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  head: () => ({
    meta: [
      { title: "Your daycare waitlist · KidEase" },
      {
        name: "description",
        content: "See daycare waitlist offers on KidEase. You have 48 hours to answer. There is no waitlist fee.",
      },
    ],
  }),
  component: MySpotOffers,
});
