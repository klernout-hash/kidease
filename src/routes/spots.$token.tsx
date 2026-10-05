import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { openSpotsCopy } from "@/lib/open-spots-checkin-copy";
import { bandLabel, isOpenSpotsBand, type OpenSpotsBand } from "@/lib/open-spots-checkin";
import { previewOpenSpotsCheckin, saveOpenSpotsCheckin } from "@/lib/server/open-spots-checkin";
import { useCopy } from "@/lib/use-copy";

function parseSearch(search: Record<string, unknown>) {
  const band = Number(search.band);
  return { band: isOpenSpotsBand(band) ? band : undefined };
}

export const Route = createFileRoute("/spots/$token")({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ params }) => previewOpenSpotsCheckin({ data: params.token }),
  head: () => ({
    meta: [
      { title: "Any open spots? · KidEase" },
      { name: "description", content: "Tap 0, 1, 2, or 3+ to confirm open spots. No login." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OpenSpotsPage,
});

const BANDS: OpenSpotsBand[] = [0, 1, 2, 3];

function OpenSpotsPage() {
  const preview = Route.useLoaderData();
  const { band } = Route.useSearch();
  const { token } = Route.useParams();
  const { locale } = useCopy();
  const copy = openSpotsCopy(locale);
  const [busy, setBusy] = useState<OpenSpotsBand | null>(null);
  const [saved, setSaved] = useState<null | { band: OpenSpotsBand; splitKnown: boolean; age: string | null }>(null);

  if (!preview.ok) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto w-full max-w-lg py-10">
          <EmptyState title={copy.invalid} action={copy.searchAgain} actionTo="/" />
        </main>
      </Shell>
    );
  }

  function onSave(next: OpenSpotsBand) {
    setBusy(next);
    void saveOpenSpotsCheckin({ data: { token, band: next } })
      .then((result) => {
        if (!result.ok) {
          toast.error(copy.invalid);
          return;
        }
        setSaved({ band: result.band, splitKnown: result.splitKnown, age: result.age });
      })
      .catch(() => toast.error(copy.invalid))
      .finally(() => setBusy(null));
  }

  const primary = band ?? null;

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.title}</h1>
        <p className="mt-4 text-lg text-muted">{copy.what}</p>
        <p className="mt-2 text-muted">{copy.why}</p>
        <p className="mt-4 font-medium">{preview.name}</p>
        <p className="mt-2 text-muted">{copy.views(preview.views)}</p>
        <p className="mt-2 text-muted">{copy.lead}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {BANDS.map((value) => {
            const label = bandLabel(value);
            const isPrimary = primary === value;
            return (
              <Button
                key={value}
                type="button"
                variant={isPrimary ? "primary" : "secondary"}
                className="min-w-11"
                disabled={busy !== null}
                onClick={() => onSave(value)}
              >
                {isPrimary ? copy.save(label) : label}
              </Button>
            );
          })}
        </div>
        {saved ? (
          <div className="mt-6" role="status">
            <p className="font-medium">{copy.saved}</p>
            <p className="mt-2 text-sm text-muted">
              {saved.splitKnown && saved.age ? copy.ageNote(saved.age) : saved.splitKnown ? copy.saved : copy.splitNote}
            </p>
            <p className="mt-4">
              <a className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline" href="/provider">
                {copy.desk}
              </a>
            </p>
          </div>
        ) : null}
      </main>
    </Shell>
  );
}
