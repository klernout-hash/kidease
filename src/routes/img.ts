import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/img")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { optimizePhoto } = await import("@/lib/server/optimize-photo");
        return optimizePhoto(request);
      },
    },
  },
});
