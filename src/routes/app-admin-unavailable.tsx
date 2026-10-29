import { createFileRoute } from "@tanstack/react-router";
import { AdminOnWebNote } from "@/components/admin-on-web-note";

export const Route = createFileRoute("/app-admin-unavailable")({
  head: () => ({
    meta: [
      { title: "Admin is on the website · KidEase" },
      { name: "description", content: "Admin is available on kidease.ca in a browser" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminOnWebNote,
});
