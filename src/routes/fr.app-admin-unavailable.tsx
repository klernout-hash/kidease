import { createFileRoute } from "@tanstack/react-router";
import { AdminOnWebNote } from "@/components/admin-on-web-note";

export const Route = createFileRoute("/fr/app-admin-unavailable")({
  head: () => ({
    meta: [
      { title: "L’admin est sur le site web · KidEase" },
      { name: "description", content: "L’admin est offert sur kidease.ca dans un navigateur." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminOnWebNote,
});
