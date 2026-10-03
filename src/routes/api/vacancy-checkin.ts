import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { applyVacancyCheckin, parseCheckinChoice, runVacancyCheckinJob } from "@/lib/server/vacancy-checkin";

function savedParam(choice: number) {
  return choice === 3 ? "3plus" : String(choice);
}

export const Route = createFileRoute("/api/vacancy-checkin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await runVacancyCheckinJob();
        return Response.json(result);
      },
      POST: async ({ request }) => {
        const type = request.headers.get("content-type") || "";
        let token = "";
        let choiceRaw: unknown = null;
        if (type.includes("application/json")) {
          const body = (await request.json().catch(() => null)) as { token?: unknown; choice?: unknown } | null;
          token = String(body?.token || "");
          choiceRaw = body?.choice;
        } else {
          const form = await request.formData();
          token = String(form.get("token") || "");
          choiceRaw = form.get("choice");
        }
        const choice = parseCheckinChoice(choiceRaw);
        const back = `/vacancy-checkin/${encodeURIComponent(token)}`;
        if (!choice) {
          return new Response(null, { status: 303, headers: { Location: back } });
        }
        const result = await applyVacancyCheckin(token, choice);
        const location = result.ok ? `${back}?saved=${savedParam(choice)}` : back;
        return new Response(null, { status: 303, headers: { Location: location } });
      },
    },
  },
});
