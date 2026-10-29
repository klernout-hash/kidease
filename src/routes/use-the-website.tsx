import { createFileRoute } from "@tanstack/react-router";
import { AdminOnWebNote } from "@/components/admin-on-web-note";

/** Older native binaries still open this path. Same page as /app-admin-unavailable. */
export const Route = createFileRoute("/use-the-website")({
  head: () => ({
    meta: [
      { title: "Admin is on the website · KidEase" },
      { name: "description", content: "Admin is available on kidease.ca in a browser" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminOnWebNote,
});
