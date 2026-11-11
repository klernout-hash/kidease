import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { API_DOC_SECTIONS, LEAD_COPY } from "@/lib/centre-lead-copy";
import { centreApiEnabled } from "@/lib/features";

export const Route = createFileRoute("/daycare-api")({
  loader: () => ({ apiOn: centreApiEnabled() }),
  head: () => ({
    meta: [
      { title: "Centre API · KidEase" },
      {
        name: "description",
        content: "How a daycare reads and updates its own families.",
      },
    ],
  }),
  component: EnglishApiDocs,
});

function EnglishApiDocs() {
  const { apiOn } = Route.useLoaderData();
  return <ApiDocs apiOn={apiOn} />;
}

export function ApiDocs({ french = false, apiOn = false }: { french?: boolean; apiOn?: boolean }) {
  const copy = french ? LEAD_COPY.fr : LEAD_COPY.en;
  const sections = french ? API_DOC_SECTIONS.fr : API_DOC_SECTIONS.en;
  const other = french ? "/daycare-api" : "/fr/daycare-api";
  return (
    <Shell>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 pb-[env(safe-area-inset-bottom)]">
        <p className="text-sm font-semibold text-primary">{copy.eyebrow}</p>
        <h1 className="mt-2 font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">{copy.apiTitle}</h1>
        <p className="mt-3 text-base text-muted">{copy.apiLead}</p>
        <p className="mt-3 text-sm">{apiOn ? copy.apiOn : copy.apiOff}</p>
        <p className="mt-4">
          <Link to={other as "/daycare-api"} className="text-primary underline-offset-2 hover:underline">
            {french ? "English" : "Français"}
          </Link>
        </p>
        {sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="font-display text-2xl">{section.heading}</h2>
            <p className="mt-2 text-base leading-relaxed">{section.body}</p>
          </section>
        ))}
        <p className="mt-8 rounded-2xl bg-surface p-4 text-sm shadow-card ring-1 ring-slate-200/80">{copy.consent}</p>
      </main>
    </Shell>
  );
}
