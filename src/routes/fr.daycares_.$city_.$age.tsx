import { createFileRoute, redirect } from "@tanstack/react-router";

/** Ancien lien `/fr/daycares/:ville/:age` → `/fr/daycare/:ville/:age`. */
export const Route = createFileRoute("/fr/daycares_/$city_/$age")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/fr/daycare/$city/$age",
      params: { city: String(params.city || "").toLowerCase(), age: String(params.age || "").toLowerCase() },
      statusCode: 301,
    });
  },
});
