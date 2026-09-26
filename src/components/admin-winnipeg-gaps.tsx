import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReauthPrompt, withReauth } from "@/components/reauth-dialog";
import { applyWinnipegGaps, listWinnipegGaps, type WinnipegGapReport } from "@/lib/server/winnipeg-gaps";
import { parseGapCsv, type FillPatch } from "@/lib/winnipeg-completeness";
import { useCopy } from "@/lib/use-copy";

function percent(share: number) {
  return `${(share * 100).toFixed(1)}%`;
}

export function AdminWinnipegGaps() {
  const { t } = useCopy();
  const reauth = useReauthPrompt();
  const [report, setReport] = useState<WinnipegGapReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [activeId, setActiveId] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [infant, setInfant] = useState("");
  const [toddler, setToddler] = useState("");
  const [preschool, setPreschool] = useState("");
  const [partTime, setPartTime] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [source, setSource] = useState("");

  async function load() {
    setPending(true);
    setError(null);
    try {
      setReport(await listWinnipegGaps());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminWinnipegEmpty"));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    listWinnipegGaps()
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("adminWinnipegEmpty"));
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const preview = useMemo(() => (csvText.trim() ? parseGapCsv(csvText) : null), [csvText]);
  const summary = report?.summary;

  function download() {
    if (!report?.csv) return;
    const blob = new Blob([report.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "winnipeg-search-gaps.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function applyPatches(patches: FillPatch[]) {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await withReauth(() => applyWinnipegGaps({ data: { patches } }), reauth.prompt);
      setResult(
        `${t("adminWinnipegApplied")} ${outcome.applied}. ${t("adminWinnipegSkipped")} ${outcome.skipped}. ${t("adminWinnipegRejected")} ${outcome.rejected.length}.`,
      );
      if (outcome.rejected[0]) setError(`${outcome.rejected[0].id}: ${outcome.rejected[0].reason}`);
      else setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminWinnipegEmpty"));
    } finally {
      setBusy(false);
    }
  }

  function fee(raw: string) {
    const text = raw.trim();
    if (!text) return undefined;
    return Number(text);
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-border">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{t("adminWinnipegNav")}</p>
          <h2 className="mt-1 font-display text-2xl">{t("adminWinnipegTitle")}</h2>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={download} disabled={!report?.csv}>
          {t("adminWinnipegDownload")}
        </Button>
      </div>
      <p className="border-t border-border px-5 py-3 text-sm text-muted">{t("adminWinnipegLead")}</p>
      {pending ? <p className="px-5 py-6 text-sm text-muted">{t("adminWinnipegLoading")}</p> : null}
      {error ? (
        <p className="px-5 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {summary ? (
        <dl className="grid grid-cols-2 gap-3 border-t border-border px-5 py-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-subtle">{t("adminWinnipegSearchVisible")}</dt>
            <dd className="font-display text-2xl">{summary.searchVisible}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">{t("adminWinnipegPlatformLive")}</dt>
            <dd className="font-display text-2xl">{summary.platformLive}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">{t("adminWinnipegLiveLooking")}</dt>
            <dd className="font-display text-2xl">{percent(summary.liveLookingShare)}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">{t("adminWinnipegPhotoFirst")}</dt>
            <dd className="font-display text-2xl">{summary.photoFirstGaps}</dd>
          </div>
        </dl>
      ) : null}
      {summary ? (
        <p className="px-5 pb-4 text-sm text-muted">
          {t("adminWinnipegBreakdown")
            .replace("{ages}", String(summary.withAges))
            .replace("{fees}", String(summary.withFees))
            .replace("{photos}", String(summary.withRealPhoto))
            .replace("{complete}", String(summary.liveLooking))}
        </p>
      ) : null}
      <form
        className="grid gap-3 border-t border-border px-5 py-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const patch: FillPatch = {
            id: activeId.trim(),
            source: source.trim(),
            ageMinMonths: ageMin.trim() ? Number(ageMin) : undefined,
            ageMaxMonths: ageMax.trim() ? Number(ageMax) : undefined,
            infantMonthly: fee(infant),
            toddlerMonthly: fee(toddler),
            preschoolMonthly: fee(preschool),
            partTimeMonthly: fee(partTime),
            photoUrl: photoUrl.trim() || undefined,
          };
          void applyPatches([patch]);
        }}
      >
        <p className="sm:col-span-2 text-sm text-muted">{t("adminWinnipegFormLead")}</p>
        <label className="text-sm">
          {t("adminWinnipegCentreId")}
          <input value={activeId} onChange={(event) => setActiveId(event.target.value)} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm">
          {t("adminWinnipegSource")}
          <input value={source} onChange={(event) => setSource(event.target.value)} placeholder={t("adminWinnipegSourceHint")} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm">
          {t("adminWinnipegAgeMin")}
          <input inputMode="numeric" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm">
          {t("adminWinnipegAgeMax")}
          <input inputMode="numeric" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm">
          {t("adminWinnipegInfant")}
          <input inputMode="numeric" value={infant} onChange={(event) => setInfant(event.target.value)} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm">
          {t("adminWinnipegToddler")}
          <input inputMode="numeric" value={toddler} onChange={(event) => setToddler(event.target.value)} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm">
          {t("adminWinnipegPreschool")}
          <input inputMode="numeric" value={preschool} onChange={(event) => setPreschool(event.target.value)} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm">
          {t("adminWinnipegPartTime")}
          <input inputMode="numeric" value={partTime} onChange={(event) => setPartTime(event.target.value)} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <label className="text-sm sm:col-span-2">
          {t("adminWinnipegPhoto")}
          <input value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} placeholder="https://" className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-border" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy || !activeId.trim()}>
            {t("adminWinnipegSaveOne")}
          </Button>
        </div>
      </form>
      <div className="border-t border-border px-5 py-4">
        <label className="block text-sm">
          {t("adminWinnipegPaste")}
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={6}
            className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs ring-1 ring-border"
          />
        </label>
        {preview ? (
          <p className="mt-2 text-sm text-muted">
            {preview.patches.length} {t("adminWinnipegRows")}
            {preview.errors.length ? ` · ${preview.errors[0]}` : ""}
          </p>
        ) : null}
        <Button
          type="button"
          className="mt-3"
          variant="secondary"
          disabled={busy || !preview?.patches.length || preview.errors.length > 0}
          onClick={() => preview && void applyPatches(preview.patches)}
        >
          {t("adminWinnipegApply")}
        </Button>
        {result ? <p className="mt-3 text-sm">{result}</p> : null}
      </div>
      {reauth.dialog}
      <ul className="divide-y divide-border border-t border-border">
        {(report?.rows || []).slice(0, 20).map((row) => (
          <li key={row.id} className="px-5 py-3">
            <button
              type="button"
              className="text-left"
              onClick={() => {
                setActiveId(row.id);
                setResult(null);
              }}
            >
              <span className="font-medium">{row.name}</span>
              <span className="mt-0.5 block text-sm text-muted">
                {row.city}
                {row.phone ? ` · ${row.phone}` : ""}
                {row.hasRealPhoto ? ` · ${t("adminWinnipegHasPhoto")}` : ""}
              </span>
              <span className="mt-1 block text-xs text-subtle">
                {[row.missingAges ? t("adminIncompleteNeedAges") : "", row.missingFees ? t("adminIncompleteNeedFees") : "", row.missingPhoto ? t("adminIncompleteNeedPhoto") : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {report && report.rows.length === 0 && !pending ? (
        <p className="px-5 py-6 text-sm text-muted">{t("adminWinnipegEmpty")}</p>
      ) : null}
    </section>
  );
}
