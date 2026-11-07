import { useMemo, useState } from "react";
import type { ControlReading, FeatureCategory } from "@/lib/admin-feature-registry";
import { FEATURE_ROLLOUTS } from "@/lib/admin-features";

type FeatureControlCard = {
  id: string;
  key: string;
  name: string;
  purpose: string;
  category: FeatureCategory;
  roles: string[];
  writable: boolean;
  sensitive: boolean;
  dependencies: string[];
  dependencyNote: string | null;
  paymentHold: string | null;
  reading: ControlReading;
};

const COPY = {
  en: {
    search: "Search features",
    parents: "Parents",
    daycares: "Daycares",
    admin: "Admin",
    government: "Government",
    shared: "Shared",
    roles: "Who it affects",
    effective: "This process",
    saved: "Saved control",
    rollout: "Rollout",
    codeDefault: "Code default",
    notLive: "A code default is not a live off switch.",
    unverified: "Not verified",
    deployment: "Deployment configuration required",
    on: "On",
    off: "Off",
    partial: "Partly on",
    unset: "Not set",
    reason: "Reason",
    confirm: "Confirm change",
    cancel: "Cancel",
    readOnly: "Read only",
    empty: "No feature matches.",
    counts: "{readable} readable. {writable} writable.",
  },
  fr: {
    search: "Chercher une fonction",
    parents: "Parents",
    daycares: "Garderies",
    admin: "Admin",
    government: "Gouvernement",
    shared: "Partagé",
    roles: "Qui est touché",
    effective: "Ce processus",
    saved: "Réglage enregistré",
    rollout: "Déploiement",
    codeDefault: "Valeur du code",
    notLive: "La valeur du code n'est pas un arrêt en direct.",
    unverified: "Pas vérifié",
    deployment: "Deployment configuration required",
    on: "Oui",
    off: "Non",
    partial: "En partie",
    unset: "Pas défini",
    reason: "Raison",
    confirm: "Confirmer",
    cancel: "Annuler",
    readOnly: "Lecture seule",
    empty: "Aucune fonction.",
    counts: "{readable} lisibles. {writable} modifiables.",
  },
} as const;

const ROLE_LABEL = {
  en: { parent: "Parents", daycare: "Daycares", admin: "Admin", government: "Government" },
  fr: { parent: "Parents", daycare: "Garderies", admin: "Admin", government: "Gouvernement" },
} as const;

function lines(reading: ControlReading, copy: (typeof COPY)[keyof typeof COPY]): string[] {
  const saved =
    reading.savedControl === "unverified"
      ? copy.unverified
      : reading.savedControl === "unset"
        ? copy.unset
        : reading.savedControl === "on"
          ? copy.on
          : copy.off;
  const out = [`${copy.saved}: ${saved}`];
  if (reading.rolloutPercent == null) out.push(`${copy.rollout}: ${copy.unverified}`);
  else out.push(`${copy.rollout}: ${reading.rolloutPercent}%`);
  if (reading.codeDefault == null) out.push(`${copy.codeDefault}: ${copy.unverified}`);
  else out.push(`${copy.codeDefault}: ${reading.codeDefault ? copy.on : copy.off}. ${copy.notLive}`);
  if (reading.effective === "unverified" || reading.effectiveSource === "code-default") {
    out.unshift(`${copy.effective}: ${copy.unverified}`);
  } else if (reading.effective === "partial") {
    out.unshift(`${copy.effective}: ${copy.partial}`);
  } else {
    out.unshift(`${copy.effective}: ${reading.effective === "on" ? copy.on : copy.off}`);
  }
  if (reading.error) out.push(reading.error);
  if (reading.deploymentConfigurationRequired) out.push(copy.deployment);
  return out;
}

export function AdminFeatureControls({
  locale,
  controls,
  busy,
  onSave,
}: {
  locale: "en" | "fr";
  controls: FeatureControlCard[];
  busy: boolean;
  onSave: (input: { key: string; rollout: number; reason: string; requestId: string }) => void;
}) {
  const copy = locale === "fr" ? COPY.fr : COPY.en;
  const roleLabel = locale === "fr" ? ROLE_LABEL.fr : ROLE_LABEL.en;
  const [category, setCategory] = useState<FeatureCategory>("parent");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ key: string; rollout: number; requestId: string } | null>(null);
  const [reason, setReason] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return controls.filter((row) => {
      if (row.category !== category) return false;
      if (!q) return true;
      return `${row.name} ${row.purpose} ${row.key}`.toLowerCase().includes(q);
    });
  }, [category, controls, query]);
  const writable = controls.filter((row) => row.writable).length;

  return (
    <div data-ke="feature-controls">
      <p className="mt-3 text-sm text-muted">{copy.counts.replace("{readable}", String(controls.length)).replace("{writable}", String(writable))}</p>
      <label className="mt-4 block text-sm">
        <span className="sr-only">{copy.search}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search}
          className="min-h-11 w-full rounded-xl bg-surface px-3 ring-1 ring-border"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {(["parent", "daycare", "admin", "government", "shared"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={category === item}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium ring-1 ring-border touch-manipulation"
            onClick={() => setCategory(item)}
          >
            {copy[item === "parent" ? "parents" : item === "daycare" ? "daycares" : item]}
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="mt-6 space-y-4">
          {shown.map((card) => (
            <li key={card.id} className="rounded-2xl bg-surface px-4 py-4 ring-1 ring-border" data-ke="feature-card" data-ke-flag={card.key}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-display text-xl leading-snug">{card.name}</h2>
                <span className="rounded-full bg-bg px-3 py-1 text-xs font-medium ring-1 ring-border">{card.writable ? (locale === "fr" ? "Modifiable" : "Can change") : copy.readOnly}</span>
              </div>
              <p className="mt-2 max-w-prose text-sm leading-6 text-muted">{card.purpose}</p>
              <p className="mt-2 text-sm">
                {copy.roles}: {card.roles.map((role) => roleLabel[role as keyof typeof roleLabel] || role).join(", ")}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {lines(card.reading, copy).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {card.dependencyNote ? <p className="mt-2 text-sm text-muted">{card.dependencyNote}</p> : null}
              {card.paymentHold ? <p className="mt-1 text-sm text-muted">{card.paymentHold}</p> : null}
              {card.writable ? (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={card.name}>
                  {FEATURE_ROLLOUTS.map((rollout) => (
                    <button
                      key={rollout}
                      type="button"
                      className="inline-flex min-h-11 min-w-11 items-center rounded-full px-3 text-sm font-medium ring-1 ring-border touch-manipulation"
                      disabled={busy}
                      aria-pressed={pending?.key === card.key && pending.rollout === rollout}
                      onClick={() => setPending({ key: card.key, rollout, requestId: `req_${Math.random().toString(36).slice(2, 12)}` })}
                    >
                      {rollout === 0 ? copy.off : rollout === 100 ? copy.on : `${rollout}%`}
                    </button>
                  ))}
                </div>
              ) : null}
              {card.writable && pending?.key === card.key ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSave({
                      key: card.key,
                      rollout: pending.rollout,
                      reason,
                      requestId: pending.requestId,
                    });
                  }}
                >
                  {card.sensitive ? (
                    <label className="block text-sm">
                      {copy.reason}
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        required
                        minLength={8}
                        className="mt-1 block min-h-11 w-full rounded-lg bg-surface px-3 ring-1 ring-border"
                      />
                    </label>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation" disabled={busy}>
                      {copy.confirm}
                    </button>
                    <button type="button" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm ring-1 ring-border touch-manipulation" disabled={busy} onClick={() => setPending(null)}>
                      {copy.cancel}
                    </button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">{copy.empty}</p>
      )}
    </div>
  );
}
