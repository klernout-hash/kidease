import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { qcHomeCopy, type QcHomeLocale, type QcHomePublicListing } from "@/lib/qc-home-daycare";

export function QcHomeDirectory({
  locale,
  enabled,
  rows,
  error,
  q,
}: {
  locale: QcHomeLocale;
  enabled: boolean;
  rows: QcHomePublicListing[];
  error: boolean;
  q: string;
}) {
  const copy = qcHomeCopy(locale);
  const fr = locale === "fr";

  return (
    <Shell>
      <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-8">
        <p className="text-sm font-medium text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">{enabled ? copy.directoryTitle : copy.closedTitle}</h1>
        <p className="mt-3 max-w-prose text-base leading-6">{enabled ? copy.directoryLead : copy.closedLead}</p>
        <p className="mt-2 max-w-prose text-base leading-6 text-muted">{enabled ? copy.directoryNext : null}</p>
        {enabled ? (
          <form method="get" className="mt-6 flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1 text-sm font-medium">
              {copy.searchLabel}
              <input
                name="q"
                defaultValue={q}
                className="ke-input mt-1"
                autoComplete="off"
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
              />
            </label>
            <Button type="submit" className="w-full sm:w-auto">
              {copy.searchButton}
            </Button>
          </form>
        ) : (
          <div className="mt-6">
            <Button asChild>
              {fr ? <Link to="/fr/search">{copy.closedButton}</Link> : <Link to="/search">{copy.closedButton}</Link>}
            </Button>
          </div>
        )}
        {error ? <p className="mt-6 text-sm text-danger" role="alert">{copy.loadError}</p> : null}
        {enabled && !error && rows.length === 0 ? (
          <div className="mt-8 rounded-xl bg-surface p-5 ring-1 ring-border">
            <h2 className="font-display text-xl">{copy.emptyTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{copy.emptyBody}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                {fr ? <Link to="/fr/search">{copy.emptyLicensed}</Link> : <Link to="/search">{copy.emptyLicensed}</Link>}
              </Button>
              <Button asChild variant="secondary">
                {fr ? <Link to="/fr">{copy.home}</Link> : <Link to="/">{copy.home}</Link>}
              </Button>
            </div>
          </div>
        ) : null}
        {enabled && rows.length > 0 ? (
          <ul className="mt-8 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {rows.map((row) => (
              <li key={row.slug}>
                {fr ? (
                  <Link
                    to="/fr/milieux-familiaux/$id"
                    params={{ id: row.slug }}
                    className="flex min-h-11 min-w-0 flex-col gap-1 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="font-medium leading-6">{row.displayName}</span>
                    {row.locationLabel ? <span className="text-sm text-muted">{row.locationLabel}</span> : null}
                  </Link>
                ) : (
                  <Link
                    to="/milieux-familiaux/$id"
                    params={{ id: row.slug }}
                    className="flex min-h-11 min-w-0 flex-col gap-1 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="font-medium leading-6">{row.displayName}</span>
                    {row.locationLabel ? <span className="text-sm text-muted">{row.locationLabel}</span> : null}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-8 text-sm">
          {fr ? (
            <Link to="/fr/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
              {copy.privacyPath}
            </Link>
          ) : (
            <Link to="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
              {copy.privacyPath}
            </Link>
          )}
        </p>
      </main>
    </Shell>
  );
}
