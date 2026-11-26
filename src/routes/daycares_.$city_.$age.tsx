import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old `/daycares/:city/:age` → the age page at `/daycare/:city/:age`. */
export const Route = createFileRoute("/daycares_/$city_/$age")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/daycare/$city/$age",
      params: { city: String(params.city || "").toLowerCase(), age: String(params.age || "").toLowerCase() },
      statusCode: 301,
    });
  },
});
