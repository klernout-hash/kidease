import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import type { CopyKey } from "@/lib/copy";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";
import {
  formatStatusCheckedAt,
  statusServices,
  type StatusService,
  type StatusServiceState,
} from "@/lib/status-public";
import { loadPublicStatus } from "@/lib/server/status-page";
import type { HealthPayload } from "@/lib/uptime";
import { useCopy } from "@/lib/use-copy";
import { formatCount } from "@/lib/utils";

export function statusHead(locale: "en" | "fr") {
  return pageSeoHead({
    title: locale === "fr" ? "État du système · KidEase" : "System status · KidEase",
    description:
      locale === "fr"
        ? "Voyez si le site KidEase, la recherche et le répertoire fonctionnent."
        : "See if the KidEase website, search, and catalogue are working.",
    path: locale === "fr" ? "/fr/status" : "/status",
    locale,
  });
}

const LABEL: Record<StatusService["id"], CopyKey> = {
  web: "statusWeb",
  database: "statusDatabase",
  search: "statusSearch",
  messages: "statusMessages",
  payments: "statusPayments",
};

const STATE_LABEL: Record<StatusServiceState, CopyKey> = {
  ok: "statusUp",
  down: "statusDown",
  skipped: "statusSkipped",
  partial: "statusMessagesDetail",
  unknown: "statusUnknown",
};

export const Route = createFileRoute("/status")({
  loader: () => loadPublicStatus(),
  head: () => statusHead("en"),
  component: EnglishStatusPage,
});

function EnglishStatusPage() {
  const data = Route.useLoaderData();
  return <StatusPage health={data.health} checkedAt={data.checkedAt} />;
}

export function StatusPage({ health, checkedAt }: { health: HealthPayload | null; checkedAt: string }) {
  const { t, locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const rows = statusServices(health);
  const when = formatStatusCheckedAt(checkedAt, lang);
  const paymentsOn = rows.some((row) => row.id === "payments" && row.state === "ok");

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8 md:py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl tracking-[-0.03em] md:text-4xl">{t("statusTitle")}</h1>
        <p className="mt-3 max-w-prose text-muted">{t("statusLead")}</p>
        {!health ? (
          <p className="mt-4 max-w-prose text-sm" role="status">
            {t("statusUnavailable")}
          </p>
        ) : null}
        <div className="mt-6">
          <Button asChild>
            <Link to={localePath("/search", lang)}>{t("statusNext")}</Link>
          </Button>
        </div>
        <ul className="mt-8 divide-y divide-border rounded-2xl bg-surface ring-1 ring-border" data-ke="status-services">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <p className="font-medium">{t(LABEL[row.id])}</p>
              <p className="max-w-prose text-sm text-muted" data-ke={`status-${row.id}`}>
                {t(STATE_LABEL[row.state])}
              </p>
            </li>
          ))}
        </ul>
        {paymentsOn ? <p className="mt-3 max-w-prose text-sm text-muted">{t("statusPaymentsDetail")}</p> : null}
        {health ? <StatusCounts health={health} /> : null}
        <p className="mt-8 text-sm text-muted" data-ke="status-checked">
          {t("statusChecked")} {when}
        </p>
        {health?.revision ? (
          <p className="text-sm text-muted" data-ke="status-revision">
            {t("statusRevision")} {health.revision}
          </p>
        ) : null}
        <p className="mt-4">
          <Link
            to={localePath("/", lang)}
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            {t("statusHome")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}

function fill(template: string, count: string) {
  return template.replace("{count}", count);
}

function StatusCounts({ health }: { health: HealthPayload }) {
  const { t, locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const lines = [
    typeof health.listingsTotal === "number" ? fill(t("statusCatalog"), formatCount(health.listingsTotal, lang)) : "",
    typeof health.winnipegTotal === "number" ? fill(t("statusWinnipeg"), formatCount(health.winnipegTotal, lang)) : "",
    typeof health.photosConfirmed === "number" ? fill(t("statusPhotos"), formatCount(health.photosConfirmed, lang)) : "",
    typeof health.feesConfirmed === "number" ? fill(t("statusFees"), formatCount(health.feesConfirmed, lang)) : "",
    typeof health.agesConfirmed === "number" ? fill(t("statusAges"), formatCount(health.agesConfirmed, lang)) : "",
  ].filter(Boolean);
  if (!lines.length) return null;
  return (
    <ul className="mt-6 space-y-1 text-sm text-muted" data-ke="status-counts">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
