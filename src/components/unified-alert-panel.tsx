import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/switch-row";
import { alertPrefsToWrite, alertShownOn } from "@/lib/alert-pref-save";
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
  const [snapshot, setSnapshot] = useState<{ settings: UnifiedSettings; prefs: Record<string, boolean> } | null>(null);
  const [touched, setTouched] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadUnifiedAlertDesk({ data: { native } })
      .then((next) => {
        if (cancelled) return;
        setDesk(next);
        setSettings(next.settings);
        setPrefs(next.prefs);
        setSnapshot({ settings: next.settings, prefs: next.prefs });
        setTouched([]);
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

  const dirty = snapshot
    ? JSON.stringify(settings) !== JSON.stringify(snapshot.settings) || JSON.stringify(prefs) !== JSON.stringify(snapshot.prefs)
    : false;

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

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
          if (!dirty) return;
          setSaving(true);
          void saveUnifiedAlertDesk({
            data: {
              settings,
              prefs: alertPrefsToWrite(prefs, touched),
            },
          })
            .then((next) => {
              setDesk(next);
              setSettings(next.settings);
              setPrefs(next.prefs);
              setSnapshot({ settings: next.settings, prefs: next.prefs });
              setTouched([]);
              confirmAction(t, "alertsSaved");
            })
            .catch(() => toast.error(copy.error))
            .finally(() => setSaving(false));
        }}
      >
        {dirty ? (
          <p className="text-sm font-medium" role="status" data-ke="alert-dirty">
            {loc === "fr" ? "Modifications non enregistrées" : "Unsaved changes"}
          </p>
        ) : null}
        <SwitchRow
          id="alert-master"
          locale={loc}
          label={copy.master}
          description={copy.masterDetail}
          checked={settings.master}
          onCheckedChange={(next) => setSettings((current) => ({ ...current, master: next }))}
        />

        <fieldset className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
          <legend className="px-1 text-sm font-medium text-fg">{copy.channels}</legend>
          <Channel
            id="alert-in-app"
            label={copy.inApp}
            detail={copy.inAppDetail}
            checked={settings.inApp}
            onChange={(checked) => setSettings((current) => ({ ...current, inApp: checked }))}
          />
          <Channel
            id="alert-email"
            label={copy.email}
            detail={copy.emailDetail}
            checked={settings.email}
            onChange={(checked) => setSettings((current) => ({ ...current, email: checked }))}
          />
          <Channel
            id="alert-push"
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
            onToggle={(typeId, enabled) => {
              setTouched((current) => (current.includes(typeId) ? current : [...current, typeId]));
              setPrefs((current) => ({ ...current, [typeId]: enabled }));
            }}
          />
        ))}

        <p className="text-sm text-muted">{copy.hidden}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? "…" : copy.save}
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-ke="alert-cancel"
            disabled={!dirty || !snapshot}
            onClick={() => {
              if (!snapshot) return;
              setSettings(snapshot.settings);
              setPrefs(snapshot.prefs);
              setTouched([]);
            }}
          >
            {loc === "fr" ? "Annuler" : "Cancel"}
          </Button>
        </div>
      </form>
      </>
      ) : null}

      {showFeed ? (
      <>
      <h3 id={showSettings ? undefined : "unified-alerts-title"} className={`${showSettings ? "mt-8" : ""} text-lg font-semibold`}>{copy.listTitle}</h3>
      <ul className="mt-3 divide-y divide-border rounded-xl bg-surface ring-1 ring-border" data-ke="unified-alert-list">
        {desk == null ? (
          <li className="px-4 py-5" role="status">
            <p className="text-sm text-muted">{t("loading")}</p>
          </li>
        ) : desk.events.length > 0 ? (
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
  id,
  label,
  detail,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <SwitchRow id={id} label={label} description={detail} checked={checked} onCheckedChange={onChange} />;
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
              <SwitchRow
                id={`alert-type-${row.id}`}
                label={row.critical ? `${text.label} · ${important}` : text.label}
                description={text.detail}
                checked={alertShownOn(prefs, row.id)}
                onCheckedChange={(next) => onToggle(row.id, next)}
                locale={locale}
              />
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
