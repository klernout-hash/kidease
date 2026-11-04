import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isNative } from "@/lib/native";
import { confirmAction } from "@/lib/success-confirm";
import {
  CANADA_TIME_ZONES,
  alertsForAudience,
  defaultUnifiedSettings,
  unifiedUiCopy,
  type UnifiedAudience,
  type UnifiedSettings,
} from "@/lib/unified-alerts";
import {
  loadUnifiedAlertDesk,
  markUnifiedAlertRead,
  saveUnifiedAlertDesk,
} from "@/lib/server/unified-alert-api";
import { useCopy } from "@/lib/use-copy";

type Desk = Awaited<ReturnType<typeof loadUnifiedAlertDesk>>;

function scrollFocus(event: { currentTarget: HTMLElement }) {
  event.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
}

export type UnifiedAlertPanelMode = "feed" | "settings" | "all";

export function UnifiedAlertPanel({ mode = "all" }: { mode?: UnifiedAlertPanelMode } = {}) {
  const showSettings = mode !== "feed";
  const showFeed = mode !== "settings";
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const copy = unifiedUiCopy(loc);
  const native = isNative();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [settings, setSettings] = useState<UnifiedSettings>(() => defaultUnifiedSettings("parent"));
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loadNote, setLoadNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadUnifiedAlertDesk({ data: { native } })
      .then((next) => {
        if (cancelled) return;
        setDesk(next);
        setSettings(next.settings);
        setPrefs(next.prefs);
      })
      .catch(() => {
        if (!cancelled) setLoadNote(copy.error);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.error, native]);

  const audiences = (desk?.audiences || ["parent"]).filter((audience) => !(native && audience === "admin"));
  const showStaffQuiet = audiences.includes("staff") && !settings.quietCustom;

  function setQuiet(patch: Partial<UnifiedSettings>) {
    setSettings((current) => ({ ...current, ...patch, quietCustom: true }));
  }

  return (
    <section className="mt-6" data-ke="unified-alerts" data-mode={mode} aria-labelledby="unified-alerts-title">
      {showSettings ? (
      <>
      <h2 id="unified-alerts-title" className="text-[1.35rem] font-semibold tracking-[-0.03em]">
        {copy.title}
      </h2>
      <p className="mt-2 text-sm text-fg">{copy.what}</p>
      <p className="mt-2 text-sm text-muted">{copy.why}</p>
      <p className="mt-2 text-sm text-fg">{copy.next}</p>
      {desk && !desk.enabled ? (
        <p className="mt-3 rounded-lg bg-surface px-3 py-3 text-sm text-fg ring-1 ring-border" role="status">
          {copy.off}
        </p>
      ) : null}
      {loadNote ? (
        <p className="mt-3 text-sm text-muted" role="alert">
          {loadNote}
        </p>
      ) : null}

      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          const typeIds = audiences.flatMap((audience) => alertsForAudience(audience).map((row) => row.id));
          void saveUnifiedAlertDesk({
            data: {
              settings,
              prefs: typeIds.map((typeId) => ({ typeId, enabled: prefs[typeId] !== false })),
            },
          })
            .then((next) => {
              setDesk(next);
              setSettings(next.settings);
              setPrefs(next.prefs);
              confirmAction(t, "alertsSaved");
            })
            .catch(() => toast.error(copy.error))
            .finally(() => setSaving(false));
        }}
      >
        <label className="flex min-h-11 items-start gap-3 rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-primary"
            checked={settings.master}
            onChange={(event) => setSettings((current) => ({ ...current, master: event.target.checked }))}
          />
          <span className="min-w-0">
            <span className="font-medium text-fg">{copy.master}</span>
            <span className="mt-1 block text-muted">{copy.masterDetail}</span>
          </span>
        </label>

        <fieldset className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
          <legend className="px-1 text-sm font-medium text-fg">{copy.channels}</legend>
          <Channel
            label={copy.inApp}
            detail={copy.inAppDetail}
            checked={settings.inApp}
            onChange={(checked) => setSettings((current) => ({ ...current, inApp: checked }))}
          />
          <Channel
            label={copy.email}
            detail={copy.emailDetail}
            checked={settings.email}
            onChange={(checked) => setSettings((current) => ({ ...current, email: checked }))}
          />
          <Channel
            label={copy.push}
            detail={desk?.pushArmed ? copy.pushDetail : copy.pushOff}
            checked={settings.push}
            onChange={(checked) => setSettings((current) => ({ ...current, push: checked }))}
          />
        </fieldset>

        <fieldset className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
          <legend className="px-1 text-sm font-medium text-fg">{copy.quiet}</legend>
          {showStaffQuiet ? <p className="mt-2 text-sm text-muted">{copy.staffQuiet}</p> : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-fg">{copy.quietStart}</span>
              <input
                type="time"
                value={settings.quietStart}
                onFocus={scrollFocus}
                onChange={(event) => setQuiet({ quietStart: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-md bg-bg px-3 text-fg ring-1 ring-border"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-fg">{copy.quietEnd}</span>
              <input
                type="time"
                value={settings.quietEnd}
                onFocus={scrollFocus}
                onChange={(event) => setQuiet({ quietEnd: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-md bg-bg px-3 text-fg ring-1 ring-border"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="font-medium text-fg">{copy.zone}</span>
            <select
              value={settings.timeZone}
              onFocus={scrollFocus}
              onChange={(event) => setSettings((current) => ({ ...current, timeZone: event.target.value }))}
              className="mt-1 min-h-11 w-full rounded-md bg-bg px-3 text-fg ring-1 ring-border"
            >
              {CANADA_TIME_ZONES.includes(settings.timeZone as (typeof CANADA_TIME_ZONES)[number]) ? null : (
                <option value={settings.timeZone}>{settings.timeZone.replaceAll("_", " ")}</option>
              )}
              {CANADA_TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace("America/", "").replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
          <legend className="px-1 text-sm font-medium text-fg">{copy.digest}</legend>
          {(
            [
              ["off", copy.digestOff],
              ["daily", copy.digestDaily],
              ["weekly", copy.digestWeekly],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="mt-2 flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="digest"
                className="size-5 accent-primary"
                checked={settings.digest === value}
                onChange={() => setSettings((current) => ({ ...current, digest: value }))}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {audiences.map((audience) => (
          <AlertGroup
            key={audience}
            audience={audience}
            title={copy.groups[audience]}
            important={copy.critical}
            locale={loc}
            prefs={prefs}
            onToggle={(typeId, enabled) => setPrefs((current) => ({ ...current, [typeId]: enabled }))}
          />
        ))}

        <p className="text-sm text-muted">{copy.hidden}</p>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "…" : copy.save}
        </Button>
      </form>
      </>
      ) : null}

      {showFeed ? (
      <>
      <h3 id={showSettings ? undefined : "unified-alerts-title"} className={`${showSettings ? "mt-8" : ""} text-lg font-semibold`}>{copy.listTitle}</h3>
      <ul className="mt-3 divide-y divide-border rounded-xl bg-surface ring-1 ring-border" data-ke="unified-alert-list">
        {desk && desk.events.length > 0 ? (
          desk.events.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
                onClick={() => {
                  void markUnifiedAlertRead({ data: { id: item.id } }).catch(() => undefined);
                }}
              >
                <span className={`mt-2 size-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-danger"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-fg">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{item.body}</span>
                  {item.critical ? <span className="mt-0.5 block text-xs font-medium text-danger">{copy.critical}</span> : null}
                </span>
              </a>
            </li>
          ))
        ) : (
          <li className="px-4 py-5">
            <p className="text-sm font-medium text-fg">{copy.empty}</p>
            <p className="mt-1 text-sm text-muted">{copy.emptyLead}</p>
            <p className="mt-3 text-sm">
              <Link to={audiences.includes("daycare") && !audiences.includes("parent") ? "/provider" : "/search"} className="underline-offset-4 hover:underline">
                {audiences.includes("daycare") && !audiences.includes("parent") ? copy.openCentre : copy.findCare}
              </Link>
            </p>
          </li>
        )}
      </ul>
      </>
      ) : null}
    </section>
  );
}

function Channel({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-2 flex min-h-11 items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="font-medium text-fg">{label}</span>
        <span className="mt-1 block text-muted">{detail}</span>
      </span>
    </label>
  );
}

function AlertGroup({
  audience,
  title,
  important,
  locale,
  prefs,
  onToggle,
}: {
  audience: UnifiedAudience;
  title: string;
  important: string;
  locale: "en" | "fr";
  prefs: Record<string, boolean>;
  onToggle: (typeId: string, enabled: boolean) => void;
}) {
  const rows = alertsForAudience(audience);
  if (!rows.length) return null;
  return (
    <fieldset className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
      <legend className="px-1 text-sm font-medium text-fg">{title}</legend>
      <ul className="mt-1">
        {rows.map((row) => {
          const text = row[locale];
          return (
            <li key={row.id}>
              <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0 accent-primary"
                  checked={prefs[row.id] !== false}
                  onChange={(event) => onToggle(row.id, event.target.checked)}
                />
                <span className="min-w-0">
                  <span className="font-medium text-fg">{text.label}</span>
                  {row.critical ? <span className="ml-2 text-xs font-medium text-danger">{important}</span> : null}
                  <span className="mt-1 block text-muted">{text.detail}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
