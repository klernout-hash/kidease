import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/fr/open-spots` → « Places ouvertes par province ». */
export const Route = createFileRoute("/fr/open-spots")({
  beforeLoad: () => {
    throw redirect({ to: "/fr/vacancy-index", statusCode: 301 });
  },
});
