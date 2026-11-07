import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  PREFERENCE_COPY,
  noticesForAudiences,
  preferenceSummary,
  wantedChannel,
  type ChannelChoice,
} from "@/lib/notification-preferences";
import { loadUnifiedAlertDesk, saveUnifiedAlertDesk } from "@/lib/server/unified-alert-api";
import type { UnifiedAlertType, UnifiedAudience } from "@/lib/unified-alerts";
import { useCopy } from "@/lib/use-copy";

type Group = { id: string; title: string; rows: UnifiedAlertType[] };

function ChannelSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="mt-1 flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-border py-3">
      <span className="text-base">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative h-8 w-14 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
      >
        <span className={`absolute top-1 size-6 rounded-full bg-bg shadow-card transition-transform ${checked ? "translate-x-7" : "translate-x-1"}`} />
      </span>
    </label>
  );
}

function choiceFor(channels: Record<string, ChannelChoice> | undefined, id: string): ChannelChoice {
  return channels?.[id] || { email: null, push: null };
}

export function PreferenceBoard({
  locale,
  groups,
  channels,
  accountEmail,
  accountPush,
  emailCanSend,
  pushCanSend,
  sending,
  inApp,
  typeOn,
  onEdit,
}: {
  locale: "en" | "fr";
  groups: Group[];
  channels: Record<string, ChannelChoice>;
  accountEmail: boolean;
  accountPush: boolean;
  emailCanSend: boolean;
  pushCanSend: boolean;
  sending: boolean;
  inApp: boolean;
  typeOn: (id: string) => boolean;
  onEdit: (row: UnifiedAlertType) => void;
}) {
  const copy = PREFERENCE_COPY[locale];
  return (
    <div data-ke="notification-preferences">
      {groups.map((group) => (
        <section key={group.id} className="mt-8 border-t border-border pt-6" aria-labelledby={`notice-group-${group.id}`}>
          <h2 id={`notice-group-${group.id}`} className="text-lg font-semibold leading-7">
            {group.title}
          </h2>
          <ul className="mt-2">
            {group.rows.map((row) => {
              const saved = choiceFor(channels, row.id);
              const summary = preferenceSummary({
                locale,
                typeOn: typeOn(row.id),
                emailWanted: row.emailOwner === "unified" && wantedChannel(saved.email, accountEmail),
                pushWanted: !row.webOnly && wantedChannel(saved.push, accountPush),
                emailControlled: row.emailOwner === "unified",
                emailCanSend,
                pushCanSend,
                sending,
                inApp,
              });
              return (
                <li key={row.id} className="flex items-start gap-3 border-b border-border py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-6">{locale === "fr" ? row.fr.label : row.en.label}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{locale === "fr" ? row.fr.detail : row.en.detail}</p>
                    <p className="mt-1 text-sm font-medium leading-5" data-ke="notice-summary">
                      {summary.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold underline underline-offset-4 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    data-ke={`notice-edit-${row.id}`}
                    onClick={() => onEdit(row)}
                  >
                    {copy.edit}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function NotificationPreferences({
  preview = false,
  localeOverride,
  embedded = false,
  previewAudiences,
  previewPush = false,
  previewSending = true,
}: {
  preview?: boolean;
  localeOverride?: "en" | "fr";
  embedded?: boolean;
  previewAudiences?: UnifiedAudience[];
  previewPush?: boolean;
  previewSending?: boolean;
}) {
  const { locale } = useCopy();
  const loc = localeOverride || (locale === "fr" ? "fr" : "en");
  const copy = PREFERENCE_COPY[loc];
  const { user, isPending } = useCurrentUserState();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [audiences, setAudiences] = useState<UnifiedAudience[]>(preview ? previewAudiences || ["daycare"] : []);
  const [channels, setChannels] = useState<Record<string, ChannelChoice>>({});
  const [accountEmail, setAccountEmail] = useState(true);
  const [accountPush, setAccountPush] = useState(previewPush);
  const [inApp, setInApp] = useState(true);
  const [emailCanSend, setEmailCanSend] = useState(preview && previewSending);
  const [pushCanSend, setPushCanSend] = useState(false);
  const [sending, setSending] = useState(preview && previewSending);
  const [enabledFlags, setEnabledFlags] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<UnifiedAlertType | null>(null);
  const [draftOn, setDraftOn] = useState(true);
  const [draftEmail, setDraftEmail] = useState(true);
  const [draftPush, setDraftPush] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (preview || !user) return;
    let live = true;
    void loadUnifiedAlertDesk({ data: { native: false } })
      .then((desk) => {
        if (!live) return;
        setAudiences(desk.audiences);
        setChannels(desk.channels || {});
        setAccountEmail(desk.settings.email);
        setAccountPush(desk.settings.push);
        setInApp(desk.settings.inApp);
        setEnabledFlags(desk.prefs);
        setEmailCanSend(desk.live && user.emailVerified === true);
        setPushCanSend(desk.pushArmed === true);
        setSending(desk.enabled && desk.live);
      })
      .catch(() => {
        if (live) setError(copy.error);
      });
    return () => {
      live = false;
    };
  }, [copy.error, preview, user]);

  const groups = noticesForAudiences(audiences.length ? audiences : preview ? previewAudiences || ["daycare"] : [], loc);

  function beginEdit(row: UnifiedAlertType) {
    const saved = choiceFor(channels, row.id);
    setOpen(row);
    setDraftOn(enabledFlags[row.id] !== false);
    setDraftEmail(wantedChannel(saved.email, accountEmail));
    setDraftPush(wantedChannel(saved.push, accountPush));
    setDirty(false);
    setError("");
    queueMicrotask(() => dialogRef.current?.showModal());
  }

  function close() {
    dialogRef.current?.close();
    setOpen(null);
    setDirty(false);
  }

  async function save() {
    if (!open || preview || !user) {
      setError(copy.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await saveUnifiedAlertDesk({
        data: {
          prefs: [
            {
              typeId: open.id,
              enabled: draftOn,
              email: open.emailOwner === "unified" ? draftEmail : null,
              push: open.webOnly ? null : draftPush,
            },
          ],
        },
      });
      setChannels(next.channels || {});
      setEnabledFlags(next.prefs);
      setNote(copy.saved);
      close();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="w-full pb-[max(1rem,env(safe-area-inset-bottom))]" data-ke="notification-preferences-screen">
      {embedded ? null : <h1 className="text-[clamp(1.75rem,5vw,2.25rem)] font-semibold tracking-[-0.03em]">{copy.title}</h1>}
      <p className="mt-4 text-sm leading-6 text-muted">{copy.pickup}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{copy.essential}</p>
      {audiences.includes("admin") ? <p className="mt-2 text-sm leading-6 text-muted">{copy.gov}</p> : null}
      {!user && !preview && !isPending && !embedded ? (
        <p className="mt-6 text-sm">
          <Link to="/login" search={{ next: "/menu?screen=notifications" }} className="font-medium text-primary">
            {copy.signIn}
          </Link>
        </p>
      ) : null}
      {error && !open ? (
        <p className="mt-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mt-4 text-sm" role="status">
          {note}
        </p>
      ) : null}
      {groups.length ? (
        <PreferenceBoard
          locale={loc}
          groups={groups}
          channels={channels}
          accountEmail={accountEmail}
          accountPush={accountPush}
              emailCanSend={emailCanSend}
              pushCanSend={pushCanSend}
              sending={sending}
              inApp={inApp}
              typeOn={(id) => enabledFlags[id] !== false}
          onEdit={beginEdit}
        />
          ) : (user || preview) && !error && !isPending ? (
        <p className="mt-6 text-sm text-muted">{copy.empty}</p>
      ) : null}
      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-[1.35rem] font-semibold">{copy.account}</h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted">{copy.marketing}</p>
      </section>
      <dialog
        ref={dialogRef}
        className="ke-notice-dialog mt-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] max-h-[85dvh] w-full max-w-lg overflow-auto rounded-t-2xl border border-border bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-fg shadow-card backdrop:bg-black/50 sm:m-auto sm:max-h-[80dvh] sm:rounded-2xl sm:pb-4"
        aria-labelledby="notice-edit-title"
        onClose={() => {
          setOpen(null);
          setDirty(false);
        }}
      >
        {open ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="notice-edit-title" className="text-xl font-semibold leading-7">
                {loc === "fr" ? open.fr.label : open.en.label}
              </h2>
                  <button type="button" className="min-h-11 min-w-11 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={close}>
                {copy.cancel}
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">{copy.sms}</p>
            {open.emailOwner !== "unified" ? <p className="mt-2 text-sm leading-6 text-muted">{copy.legacyEmail}</p> : null}
            <p className="mt-3 text-sm leading-6 text-muted">{copy.noticeHint}</p>
            <ChannelSwitch
              label={copy.notice}
              checked={draftOn}
              onChange={(next) => {
                setDraftOn(next);
                setDirty(true);
              }}
            />
            {open.emailOwner === "unified" ? (
              <ChannelSwitch
                label={loc === "fr" ? "Courriel" : "Email"}
                checked={draftEmail}
                onChange={(next) => {
                  setDraftEmail(next);
                  setDirty(true);
                }}
              />
            ) : null}
            {!open.webOnly ? (
              <ChannelSwitch
                label="Push"
                checked={draftPush}
                onChange={(next) => {
                  setDraftPush(next);
                  setDirty(true);
                }}
              />
            ) : null}
            {!emailCanSend && draftEmail ? <p className="mt-2 text-sm text-muted">{copy.emailSetup}</p> : null}
            {!pushCanSend && draftPush ? <p className="mt-2 text-sm text-muted">{copy.pushSetup}</p> : null}
            {dirty ? <p className="mt-3 text-sm">{copy.dirty}</p> : null}
            {error ? (
              <p className="mt-2 text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
                  <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm font-semibold text-bg touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40" disabled={busy || !dirty}>
                {copy.save}
              </button>
              <button type="button" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm ring-1 ring-border touch-manipulation" onClick={close}>
                {copy.cancel}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </section>
  );
}
