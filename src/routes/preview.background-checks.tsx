import { createFileRoute } from "@tanstack/react-router";
import { BackgroundCheckAttestationSample } from "@/components/background-check-attestation";
import { BackgroundCheckRecordBoard } from "@/components/background-check-records";
import type { BackgroundCheckCentreView } from "@/lib/server/background-check-records";
import { Shell } from "@/components/shell";
import { backgroundCheckGuideEnabled } from "@/lib/features";

export const Route = createFileRoute("/preview/background-checks")({
  validateSearch: (search: Record<string, unknown>) => ({
    lang: search.lang === "fr" ? ("fr" as const) : ("en" as const),
  }),
  loader: () => ({ open: backgroundCheckGuideEnabled() }),
  head: () => ({
    meta: [
      { title: "Background check preview · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function sampleCentre(): BackgroundCheckCentreView {
  return {
    daycareId: "sample",
    name: "Sample centre",
    province: "ON",
    canWrite: true,
    policyMonths: null,
    policyAllowed: false,
    attest: true,
    attestAt: "2026-11-22T15:00:00.000Z",
    showExpiry: false,
    attestationOn: true,
    records: [
      {
        id: "sample-current",
        personName: "Sample educator",
        role: "centre_staff",
        checkKind: "vsc",
        issuedOn: "2024-06-01",
        expiresOn: "2029-06-01",
        reviewedName: "Sample director",
        reviewedAt: "2026-11-01T15:00:00.000Z",
        hasFile: false,
        status: "current",
        dueOn: "2029-06-01",
      },
      {
        id: "sample-soon",
        personName: "Sample volunteer",
        role: "volunteer_student",
        checkKind: "offence_declaration",
        issuedOn: "2025-12-01",
        expiresOn: "2026-12-16",
        reviewedName: "Sample director",
        reviewedAt: "2026-11-01T15:00:00.000Z",
        hasFile: false,
        status: "due_soon",
        dueOn: "2026-12-16",
      },
      {
        id: "sample-expired",
        personName: "Sample assistant",
        role: "centre_staff",
        checkKind: "vsc",
        issuedOn: "2020-01-15",
        expiresOn: "2025-01-15",
        reviewedName: "Sample director",
        reviewedAt: "2024-02-01T15:00:00.000Z",
        hasFile: false,
        status: "expired",
        dueOn: "2025-01-15",
      },
    ],
  };
}

function Page() {
  const { lang } = Route.useSearch();
  const { open } = Route.useLoaderData();
  if (!open) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-3xl py-8">
          <h1 className="font-display text-3xl">{lang === "fr" ? "Aperçu éteint" : "Preview is off"}</h1>
        </main>
      </Shell>
    );
  }
  const centre = sampleCentre();
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl space-y-8 py-8">
        <h1 className="font-display text-3xl">{lang === "fr" ? "Aperçu des dossiers" : "Record preview"}</h1>
        <BackgroundCheckRecordBoard
          centre={centre}
          locale={lang}
          sample
          onSave={async () => "sample-saved"}
          onSettings={async () => undefined}
          onUpload={async () => undefined}
        />
        <section data-ke="listing-attestation-sample">
          <h2 className="font-display text-2xl">{lang === "fr" ? "Phrase sur la fiche" : "Listing sentence"}</h2>
          <BackgroundCheckAttestationSample locale={lang} />
        </section>
      </main>
    </Shell>
  );
}
