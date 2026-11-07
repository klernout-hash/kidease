import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuccessConfirm } from "@/components/use-success-confirm";
import { AdminFeatureControls } from "@/components/admin-feature-controls";
import { Shell } from "@/components/shell";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { killAiFeatures, loadFeaturePage, updateFeatureSwitch } from "@/lib/server/admin-features";
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

function FeaturesPage() {
  const page = Route.useLoaderData();
  const router = useRouter();
  const { t, locale } = useCopy();
  const { celebrate } = useSuccessConfirm();
  const [killConfirm, setKillConfirm] = useState(false);
  const [killReason, setKillReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const readonly = page.counts.writable === 0;

  async function save(input: { key: string; rollout: number; reason: string; requestId: string }) {
    setBusy(true);
    setError("");
    try {
      const result = await updateFeatureSwitch({ data: input });
      if (!result.ok) {
        setError(result.error === "key-not-set" ? t("adminFeaturesKeyMissing") : t("adminFeaturesSaveFailed"));
        return;
      }
      celebrate();
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
      const result = await killAiFeatures({ data: { reason: killReason, requestId: `kill_${Date.now().toString(36)}` } });
      if (!result.ok) setError(t("adminFeaturesSaveFailed"));
      else celebrate();
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
        <h1 className="font-display text-[clamp(1.75rem,4vw,2.25rem)]">{t("adminFeaturesTitle")}</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted">{t("adminFeaturesLead")}</p>
        {page.reason === "key-not-set" ? (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border" role="status">
            {t("adminFeaturesKeyMissing")}
          </p>
        ) : null}
        {page.reason === "unverified" ? (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border" role="status">
            {t("adminFeaturesUnknown")}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6">
          {killConfirm ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void killAll();
              }}
            >
              <label className="block text-sm">
                {locale === "fr" ? "Raison" : "Reason"}
                <input
                  value={killReason}
                  onChange={(event) => setKillReason(event.target.value)}
                  required
                  minLength={8}
                  className="mt-1 block min-h-11 w-full max-w-lg rounded-lg bg-surface px-3 ring-1 ring-border"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation" disabled={busy || readonly}>
                  {t("adminFeaturesKillConfirm")}
                </button>
                <button type="button" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ring-1 ring-border touch-manipulation" disabled={busy} onClick={() => setKillConfirm(false)}>
                  {t("adminToolCancel")}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation" disabled={busy || readonly} onClick={() => setKillConfirm(true)}>
              {t("adminFeaturesKill")}
            </button>
          )}
        </div>
        <AdminFeatureControls locale={locale === "fr" ? "fr" : "en"} controls={page.controls} busy={busy} onSave={(input) => void save(input)} />
        <p className="mt-8">
          <Link to="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
            {t("adminToolBack")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
