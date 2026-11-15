import { createFileRoute } from "@tanstack/react-router";
import { NotificationsInbox } from "@/components/notifications-inbox";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";

export const Route = createFileRoute("/fr/notifications")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  head: () => ({
    meta: [
      { title: "Avis · KidEase" },
      { name: "description", content: "Avis pour les visites, les demandes, les revendications et les messages sur KidEase." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NotificationsInbox,
});
