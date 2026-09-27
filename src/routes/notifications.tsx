import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { NotificationsInbox } from "@/components/notifications-inbox";

export const Route = createFileRoute("/notifications")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  head: () => ({
    meta: [
      { title: "Notifications · KidEase" },
      { name: "description", content: "Alerts for tours, requests, claims, and messages on KidEase." },
    ],
  }),
  component: NotificationsInbox,
});
