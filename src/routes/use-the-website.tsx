import { createFileRoute } from "@tanstack/react-router";
import { AdminOnWebNote, beforeLoadNativeAdminLauncher } from "@/components/admin-on-web-note";

/** Older native binaries still open this path. Same page as /app-admin-unavailable. */
export const Route = createFileRoute("/use-the-website")({
  beforeLoad: beforeLoadNativeAdminLauncher,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: AdminOnWebNote,
});
