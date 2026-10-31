import { createFileRoute } from "@tanstack/react-router";
import { dashboardCsv } from "@/lib/gov/csv";
import { dashboardPdfLines, renderTextPdf } from "@/lib/gov/pdf";
import { govCopy } from "@/lib/gov/copy";
import { auditGov, loadGovActor } from "@/lib/server/gov-actor.server";
import { dashboardForActor } from "@/lib/server/gov-portal";

const robots = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
};

export const Route = createFileRoute("/api/gov/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const user = await getSessionUser();
        if (!user) return new Response("Unauthorized", { status: 401, headers: robots });
        const actor = await loadGovActor(user.id);
        if (!actor) return new Response("Not authorized", { status: 403, headers: robots });
        const url = new URL(request.url);
        const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
        const locale = url.searchParams.get("locale") === "fr" ? "fr" : "en";
        try {
          const data = await dashboardForActor(actor, {
            province: url.searchParams.get("province"),
            region: url.searchParams.get("region"),
            city: url.searchParams.get("city"),
            locale,
          });
          await auditGov({
            userId: actor.userId,
            action: format === "pdf" ? "export_pdf" : "export_csv",
            province: data.province,
          });
          if (format === "csv") {
            return new Response(dashboardCsv(data), {
              headers: {
                ...robots,
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": "attachment; filename=\"kidease-government.csv\"",
              },
            });
          }
          const copy = govCopy(locale);
          const lines = dashboardPdfLines({
            title: copy.reportTitle,
            place: data.placeLabel,
            generatedAt: data.generatedAt,
            rows: [
              [copy.licensed, String(data.kpis.licensedCentres ?? copy.suppressed)],
              [copy.capacity, String(data.kpis.capacity ?? copy.suppressed)],
              [copy.spots, String(data.kpis.openSpots ?? copy.suppressed)],
              [copy.reporters, String(data.kpis.vacancyReporters ?? copy.suppressed)],
              [copy.jobs, String(data.kpis.jobPosts ?? copy.suppressed)],
            ],
            notes: data.coverage,
          });
          const pdf = renderTextPdf(lines);
          return new Response(Buffer.from(pdf), {
            headers: {
              ...robots,
              "content-type": "application/pdf",
              "content-disposition": "attachment; filename=\"kidease-government.pdf\"",
            },
          });
        } catch (err) {
          const status = (err as { status?: number }).status;
          const code = status === 429 || status === 403 ? status : 500;
          return new Response(code === 429 ? "Too many requests" : "Unavailable", { status: code, headers: robots });
        }
      },
    },
  },
});
