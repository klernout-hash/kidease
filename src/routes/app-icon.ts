import { createFileRoute } from "@tanstack/react-router";
import { appIconPngResponse } from "@/lib/app-icon-png";

/** Bright 180x180 KidEase pin. Real PNG bytes so iOS Add to Home Screen
 *  does not fall back to a stretched page screenshot or tall transparent logo. */
export const Route = createFileRoute("/app-icon")({
  server: {
    handlers: {
      GET: async () => appIconPngResponse(),
    },
  },
});
