import { createFileRoute } from "@tanstack/react-router";
import { appIconPngResponse } from "@/lib/app-icon-png";

/** iOS Add to Home Screen requests /app-icon and /apple-touch-icon.png.
 *  Return the actual PNG bytes — do not redirect. */
export const Route = createFileRoute("/app-icon")({
  server: {
    handlers: {
      GET: async () => appIconPngResponse(),
    },
  },
});
