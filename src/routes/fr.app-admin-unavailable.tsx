import { createFileRoute } from "@tanstack/react-router";
import { AdminOnWebNote, beforeLoadNativeAdminLauncher } from "@/components/admin-on-web-note";

export const Route = createFileRoute("/fr/app-admin-unavailable")({
  beforeLoad: beforeLoadNativeAdminLauncher,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminOnWebNote,
});
