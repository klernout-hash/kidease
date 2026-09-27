import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { NotificationsInbox } from "@/components/notifications-inbox";

export const Route = createFileRoute("/notifications")({
  beforeLoad: () => beforeLoadPrivate("/notifications"),
  head: () => ({
    meta: [
      { title: "Notifications · KidEase" },
      { name: "description", content: "Alerts for tours, requests, claims, and messages on KidEase." },
    ],
  }),
  component: NotificationsInbox,
});
