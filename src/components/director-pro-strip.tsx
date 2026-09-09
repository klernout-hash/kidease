import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";

export function DirectorProStrip({
  views,
  requests,
}: {
  views: number;
  requests: number;
}) {
  const { t } = useCopy();
  const weekViews = Number.isFinite(views) ? Math.max(0, Math.floor(views)) : 0;
  const weekRequests = Number.isFinite(requests) ? Math.max(0, Math.floor(requests)) : 0;
  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-border">
      <p className="font-semibold">{t("proWhyTitle")}</p>
      <p className="mt-1 text-sm text-muted">{t("proWhyLead")}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-center text-sm">
        <div className="rounded-md bg-bg p-3">
          <dt className="text-muted">{t("proWhyViews")}</dt>
          <dd className="font-display text-2xl tabular-nums">{weekViews}</dd>
        </div>
        <div className="rounded-md bg-bg p-3">
          <dt className="text-muted">{t("proWhyRequests")}</dt>
          <dd className="font-display text-2xl tabular-nums">{weekRequests}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-subtle">
        <Link to="/provider/subscription" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("planPro")}
        </Link>
        {" · "}
        {t("planFree")}
      </p>
    </section>
  );
}
