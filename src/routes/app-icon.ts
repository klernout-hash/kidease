import { createFileRoute } from "@tanstack/react-router";

/** iOS Add to Home Screen hits /app-icon and /apple-touch-icon.png.
 *  Serve the real square KidEase pin already at /icon-512.png. */
export const Route = createFileRoute("/app-icon")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: "/icon-512.png?v=12",
            "cache-control": "public, max-age=3600, must-revalidate",
          },
        }),
    },
  },
});
