import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { killAiFeatures, loadFeaturePage, updateFeatureSwitch, type FeatureCard } from "@/lib/server/admin-features";
import { FEATURE_ROLLOUTS, featureStatusKind } from "@/lib/admin-features";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/admin/features")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadFeaturePage(),
  head: () => ({
    meta: [
      { title: "Features · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FeaturesPage,
});

function statusLine(
  card: FeatureCard,
  t: (key: "adminFeaturesUnknown" | "adminFeaturesOff" | "adminFeaturesEveryone" | "adminFeaturesPercent") => string,
) {
  const kind = featureStatusKind(card);
  if (kind === "unknown") return t("adminFeaturesUnknown");
  if (kind === "off") return t("adminFeaturesOff");
  if (kind === "everyone") return t("adminFeaturesEveryone");
  return t("adminFeaturesPercent").replace("{n}", String(card.rollout));
}

function FeaturesPage() {
  const page = Route.useLoaderData();
  const router = useRouter();
  const { t } = useCopy();
  const [pending, setPending] = useState<{ key: string; rollout: number } | null>(null);
  const [killConfirm, setKillConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const readonly = page.mode === "readonly";

  async function save(key: string, rollout: number) {
    setBusy(true);
    setError("");
    try {
      const result = await updateFeatureSwitch({ data: { key, rollout } });
      if (!result.ok) {
        setError(t("adminFeaturesSaveFailed"));
        return;
      }
      setPending(null);
      await router.invalidate();
    } catch {
      setError(t("adminFeaturesSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function killAll() {
    setBusy(true);
    setError("");
    try {
      const result = await killAiFeatures();
      if (!result.ok) setError(t("adminFeaturesSaveFailed"));
      setKillConfirm(false);
      await router.invalidate();
    } catch {
      setError(t("adminFeaturesSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl">{t("adminFeaturesTitle")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">{t("adminFeaturesLead")}</p>
        {readonly ? (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border" role="status">
            {t("adminFeaturesKeyMissing")}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6">
          {killConfirm ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
                disabled={busy || readonly}
                onClick={() => void killAll()}
              >
                {t("adminFeaturesKillConfirm")}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ring-1 ring-border touch-manipulation"
                disabled={busy}
                onClick={() => setKillConfirm(false)}
              >
                {t("adminToolCancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
              disabled={busy || readonly}
              onClick={() => setKillConfirm(true)}
            >
              {t("adminFeaturesKill")}
            </button>
          )}
        </div>
        <ul className="mt-8 space-y-4">
          {page.cards.map((card) => (
            <li key={card.key} className="rounded-2xl bg-surface px-4 py-4 ring-1 ring-border" data-ke="feature-card" data-ke-flag={card.key}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-display text-xl">{card.name}</h2>
                {card.built ? null : (
                  <span className="rounded-full bg-bg px-3 py-1 text-xs font-medium ring-1 ring-border">{t("adminFeaturesNotBuilt")}</span>
                )}
              </div>
              <p className="mt-2 max-w-prose text-sm text-muted">{card.description}</p>
              <p className="mt-3 text-sm font-medium">{statusLine(card, t)}</p>
              <p className="mt-1 text-xs text-subtle">
                {t("adminFeaturesLastChanged")}: {card.updatedAt || t("adminFeaturesUnknownTime")}
              </p>
              {card.known && !card.inPostHog ? <p className="mt-1 text-sm text-muted">{t("adminFeaturesNotInPostHog")}</p> : null}
              {card.calls != null ? (
                <p className="mt-2 text-sm text-muted">
                  {t("adminFeaturesCalls")}: {card.calls}. {t("adminFeaturesTrue")}: {card.trues ?? 0}.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={card.name}>
                {FEATURE_ROLLOUTS.map((rollout) => {
                  const chosen = pending?.key === card.key && pending.rollout === rollout;
                  return (
                    <button
                      key={rollout}
                      type="button"
                      className="inline-flex min-h-11 min-w-11 items-center rounded-full px-3 text-sm font-medium ring-1 ring-border touch-manipulation"
                      disabled={busy || readonly}
                      aria-pressed={chosen}
                      onClick={() => setPending({ key: card.key, rollout })}
                    >
                      {rollout === 0 ? t("adminFeaturesOff") : `${rollout}%`}
                    </button>
                  );
                })}
              </div>
              {pending?.key === card.key ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
                    disabled={busy || readonly}
                    onClick={() => void save(card.key, pending.rollout)}
                  >
                    {t("adminFeaturesConfirm")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ring-1 ring-border touch-manipulation"
                    disabled={busy}
                    onClick={() => setPending(null)}
                  >
                    {t("adminToolCancel")}
                  </button>
                </div>
              ) : null}
              <h3 className="mt-4 text-sm font-medium">{t("adminFeaturesHistory")}</h3>
              {card.history.length ? (
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {card.history.map((row) => (
                    <li key={row.id}>
                      {row.at} · {row.oldValue} → {row.newValue}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">{t("adminFeaturesHistoryEmpty")}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link to="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
            {t("adminToolBack")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
