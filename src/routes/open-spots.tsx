import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/open-spots` is the plain name parents guess. The page is "Open spots by province". */
export const Route = createFileRoute("/open-spots")({
  beforeLoad: () => {
    throw redirect({ to: "/vacancy-index", statusCode: 301 });
  },
});
