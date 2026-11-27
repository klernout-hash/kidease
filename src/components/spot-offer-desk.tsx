import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { spotOfferCopy } from "@/lib/spot-offer-copy";
import { gapCopy } from "@/lib/gap-features";
import {
  exportCentreWaitlistAudit,
  listCentreWaitlist,
  offerSpotToNextFamily,
  rankWaitlistEntry,
  saveWaitlistOrder,
  sendCentreSpotOffer,
  setCentreWaitlistOpen,
  setWaitlistSiblingPriority,
  tagWaitlistFamily,
  type CentreWaitlistCard,
} from "@/lib/server/spot-offers";
import { pipelineCopy } from "@/lib/pipeline-copy";
import { countdownLabel, offerCountdown } from "@/lib/pipeline-features";
import { useCopy } from "@/lib/use-copy";
import { RuntimePaused } from "@/components/runtime-paused";
import { useRuntimeSwitches } from "@/lib/use-runtime-switches";
import { useRoleChrome } from "@/components/role-chrome";
import { useInNativeShell } from "@/lib/use-native-shell";

function when(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });
}

/** Keep the file long enough for iPhone Safari to save it. Revoking at once opens a blank page. */
function saveWaitlistCsv(csv: string, filename: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function SpotOfferDesk({ includeTest = false, centreId }: { includeTest?: boolean; centreId?: string }) {
  const { locale } = useCopy();
  const waitlistOn = useRuntimeSwitches().waitlistSpots;
  const nativeShell = useInNativeShell();
  const chrome = useRoleChrome();
  const plansOn = !nativeShell && chrome.subscriptionsEnabled === true;
  const copy = spotOfferCopy(locale);
  const [centres, setCentres] = useState<CentreWaitlistCard[] | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [tools, setTools] = useState(false);
  const rankCopy = gapCopy(locale === "fr" ? "fr" : "en");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pc = pipelineCopy(locale);
  const [offerAges, setOfferAges] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function load() {
    return listCentreWaitlist({ data: { includeTest } })
      .then((result) => {
        setCentres(result.centres);
        setEmailEnabled(result.emailEnabled);
        setTools(result.toolsEnabled);
      })
      .catch(() => setCentres([]));
  }

  useEffect(() => {
    let live = true;
    void listCentreWaitlist({ data: { includeTest } })
      .then((result) => {
        if (!live) return;
        setCentres(result.centres);
        setEmailEnabled(result.emailEnabled);
        setTools(result.toolsEnabled);
      })
      .catch(() => {
        if (live) setCentres([]);
      });
    return () => {
      live = false;
    };
  }, [includeTest]);

  if (!waitlistOn) return <RuntimePaused id="waitlistSpots" compact />;
  if (!centres) return <p className="mt-4 text-sm text-muted">{copy.deskTitle}</p>;
  const visibleCentres = centreId ? centres.filter((centre) => centre.daycareId === centreId) : centres;
  if (!visibleCentres.length) return null;

  function run(key: string, task: () => Promise<unknown>, success?: string) {
    setBusy(key);
    setError(null);
    return task()
      .then(() => {
        if (success) toast.success(success);
        return load();
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : pc.error;
        setError(message);
        toast.error(message);
      })
      .finally(() => setBusy(null));
  }

  function moveFamily(centre: CentreWaitlistCard, fromId: string, toId: string) {
    const line = centre.families.filter((row) => row.status === "waiting" || row.status === "offered").map((row) => row.id);
    const from = line.indexOf(fromId);
    const to = line.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = line.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    void run(`order-${centre.daycareId}`, () => saveWaitlistOrder({ data: { daycareId: centre.daycareId, ids: next } }), pc.orderSaved);
  }

  return (
    <section className="mb-8 rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="spot-offer-desk">
      <h2 className="font-display text-2xl">{copy.deskTitle}</h2>
      <p className="mt-1 text-sm text-muted">
        {copy.deskLead}
        {plansOn ? ` ${copy.included}` : ""}
      </p>
      {emailEnabled ? null : <p className="mt-2 text-sm text-muted">{copy.mailOff}</p>}
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 space-y-6">
        {visibleCentres.map((centre) => {
          const offerAge = offerAges[centre.daycareId] ?? "infant";
          const countdown = centre.openOfferExpiresAt ? offerCountdown(centre.openOfferExpiresAt, now) : null;
          const offeredFamily = centre.families.find((row) => row.id === centre.openOfferWaitlistId);
          return (
          <div key={centre.daycareId} className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">{centre.daycareName}</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm" data-ke="waitlist-open-toggle">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={centre.waitlistOpen}
                    disabled={busy === `open-${centre.daycareId}`}
                    onChange={(event) => {
                      const open = event.target.checked;
                      void run(`open-${centre.daycareId}`, () => setCentreWaitlistOpen({ data: { daycareId: centre.daycareId, open } }));
                    }}
                  />
                  {pc.waitlistOpen}
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={centre.siblingPriority}
                    onChange={(event) => {
                      const on = event.target.checked;
                      void run(`sib-${centre.daycareId}`, () => setWaitlistSiblingPriority({ data: { daycareId: centre.daycareId, on } }));
                    }}
                  />
                  {locale === "fr" ? "Frères et sœurs d’abord" : "Siblings first"}
                </label>
                {centre.families.length ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void exportCentreWaitlistAudit({ data: { daycareId: centre.daycareId } })
                      .then((result) => {
                        const csv = String(result.csv || "").trim();
                        if (!csv || csv.split("\n").length < 2) {
                          setError(locale === "fr" ? "Aucune famille sur cette liste." : "No families on this waitlist yet.");
                          return;
                        }
                        const slug = centre.slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "waitlist";
                        saveWaitlistCsv(csv, `${slug}-waitlist-order.csv`);
                      })
                      .catch((err: unknown) => {
                        const message = err instanceof Error ? err.message : copy.feeBlocked;
                        setError(message);
                      });
                  }}
                >
                  {locale === "fr" ? "Télécharger l’ordre" : "Download the order"}
                </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-sm text-muted">{centre.waitlistOpen ? pc.waitlistOpenLead : pc.waitlistClosedNote}</p>
            {countdown && !countdown.expired ? (
              <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-sm ring-1 ring-border" role="status" data-ke="open-offer-countdown">
                <span className="font-medium">{pc.openOffer}</span>
                {offeredFamily ? ` · ${offeredFamily.parentName}` : ""} · {countdownLabel(countdown, locale)}
              </p>
            ) : null}
            {centre.families.some((row) => row.status === "waiting") && !centre.openOfferId ? (
              <div className="mt-3 rounded-lg bg-bg p-3 ring-1 ring-border" data-ke="offer-next-family">
                <p className="font-medium">{pc.offerNextTitle}</p>
                <p className="mt-1 text-sm text-muted">{pc.offerNextLead}</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-sm">
                    <span className="sr-only">{copy.ageLabel}</span>
                    <select
                      className="ke-input min-h-11"
                      value={offerAge}
                      onChange={(event) => setOfferAges((cur) => ({ ...cur, [centre.daycareId]: event.target.value }))}
                    >
                      {(["infant", "toddler", "preschool", "any"] as const).map((age) => (
                        <option key={age} value={age}>
                          {pc.ages[age]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    disabled={busy === `next-${centre.daycareId}`}
                    onClick={() =>
                      void run(
                        `next-${centre.daycareId}`,
                        () => offerSpotToNextFamily({ data: { daycareId: centre.daycareId, ageGroup: offerAge } }),
                        pc.offerSent,
                      )
                    }
                  >
                    {pc.offerNextButton}
                  </Button>
                </div>
              </div>
            ) : null}
            {centre.families.length ? (
              <>
              <p className="mt-3 text-xs text-muted">{pc.dragHint} {pc.tagsHelp}</p>
              <ul className="mt-2 divide-y divide-border">
                {centre.families.map((family) => {
                  const waiting = family.status === "waiting";
                  const offered = family.status === "offered";
                  const inLine = waiting || offered;
                  return (
                    <li
                      key={family.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                      draggable={inLine}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", family.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => {
                        if (inLine) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const fromId = event.dataTransfer.getData("text/plain");
                        if (fromId) moveFamily(centre, fromId, family.id);
                      }}
                      data-ke="waitlist-family"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {family.place ? <span className="mr-2 tabular-nums text-muted">{family.place}.</span> : null}
                          {family.parentName}
                          {family.childLabel ? ` · ${family.childLabel}` : ""}
                        </p>
                        <p className="text-sm text-muted">
                          {pc.ages[family.ageGroup]} · {pc.statuses[family.status]} · {when(family.joinedAt, locale)}
                        </p>
                        {family.staffChild || family.sibling ? (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {family.staffChild ? <span className="rounded-full bg-bg px-2 py-0.5 text-xs ring-1 ring-border">{pc.tagStaff}</span> : null}
                            {family.sibling ? <span className="rounded-full bg-bg px-2 py-0.5 text-xs ring-1 ring-border">{pc.tagSibling}</span> : null}
                          </p>
                        ) : null}
                        {family.note ? <p className="mt-1 text-sm text-muted">{family.note}</p> : null}
                        {inLine ? (
                          <fieldset className="mt-1 flex flex-wrap gap-3 text-sm">
                            <legend className="sr-only">{pc.tagsLabel}</legend>
                            <label className="inline-flex min-h-11 items-center gap-2">
                              <input
                                type="checkbox"
                                className="size-4"
                                checked={family.sibling}
                                disabled={busy === `tag-${family.id}`}
                                onChange={(event) => {
                                  const on = event.target.checked;
                                  void run(`tag-${family.id}`, () => tagWaitlistFamily({ data: { id: family.id, tag: "sibling", on } }));
                                }}
                              />
                              {pc.tagSibling}
                            </label>
                            <label className="inline-flex min-h-11 items-center gap-2">
                              <input
                                type="checkbox"
                                className="size-4"
                                checked={family.staffChild}
                                disabled={busy === `tag-${family.id}`}
                                onChange={(event) => {
                                  const on = event.target.checked;
                                  void run(`tag-${family.id}`, () => tagWaitlistFamily({ data: { id: family.id, tag: "staff_child", on } }));
                                }}
                              />
                              {pc.tagStaff}
                            </label>
                          </fieldset>
                        ) : null}
                      </div>
                      {tools && inLine ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy === family.id}
                            onClick={() => void run(family.id, () => rankWaitlistEntry({ data: { id: family.id, direction: "up" } }))}
                          >
                            {rankCopy.rankUp}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy === family.id}
                            onClick={() => void run(family.id, () => rankWaitlistEntry({ data: { id: family.id, direction: "down" } }))}
                          >
                            {rankCopy.rankDown}
                          </Button>
                        </div>
                      ) : null}
                      {waiting && !centre.openOfferId ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy === family.id}
                          onClick={() => void run(family.id, () => sendCentreSpotOffer({ data: { waitlistId: family.id } }), pc.offerSent)}
                        >
                          {copy.offerSpot}
                        </Button>
                      ) : null}
                      {offered ? <p className="text-sm text-muted">{copy.openOffer}</p> : null}
                    </li>
                  );
                })}
              </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {copy.emptyDesk}{" "}
                <Link to="/daycare/$slug" params={{ slug: centre.slug }} className="text-primary underline-offset-4 hover:underline">
                  {centre.daycareName}
                </Link>
              </p>
            )}
          </div>
          );
        })}
      </div>
    </section>
  );
}
