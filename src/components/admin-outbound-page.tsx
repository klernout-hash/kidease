import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  CONTROL_KEYS,
  OUTBOUND_CHANNELS,
  OUTBOUND_GROUPS,
  type OutboundChannel,
  type OutboundGroup,
} from "@/lib/outbound-controls";
import type { OutboundPage } from "@/lib/server/admin-outbound";

type Locale = "en" | "fr";

const COPY = {
  en: {
    switches: "Master switches",
    switchesLead: "Off stops that whole group. On lets each feature follow its own setting.",
    on: "On",
    off: "Off",
    turnOn: "Turn on",
    turnOff: "Turn off",
    caps: "Daily limits",
    capsLead: "Days reset at midnight, Winnipeg time. When a limit is hit, that channel pauses and you get one email.",
    essential: "Password, verification and emergency messages are counted but always go out.",
    perCall: "Minutes counted per call or video join",
    perCallLead: "Twilio does not report call length to KidEase yet, so each call counts as this many minutes.",
    save: "Save",
    saved: "Saved",
    test: "Test mode",
    testLead: "Sends every email and text to the test address instead. Each one says who it was meant for.",
    testEmail: "Test email",
    testPhone: "Test phone (+1…)",
    envFallback: "Empty uses the Vercel setting",
    noRecipient: "Add a test email and phone first. While test mode is on with no address, nothing is sent.",
    today: "Today",
    channel: "Channel",
    sent: "Counted",
    blocked: "Stopped",
    limit: "Limit",
    changes: "Recent changes",
    none: "No changes yet.",
    back: "Back to admin",
    failed: "Could not save. Try again.",
  },
  fr: {
    switches: "Interrupteurs principaux",
    switchesLead: "Éteint arrête tout le groupe. Allumé laisse chaque fonction suivre son propre réglage.",
    on: "Allumé",
    off: "Éteint",
    turnOn: "Allumer",
    turnOff: "Éteindre",
    caps: "Limites par jour",
    capsLead: "Le compteur repart à minuit, heure de Winnipeg. À la limite, le canal s’arrête et vous recevez un courriel.",
    essential: "Les messages de mot de passe, de vérification et d’urgence sont comptés mais partent toujours.",
    perCall: "Minutes comptées par appel ou vidéo",
    perCallLead: "Twilio n’envoie pas encore la durée des appels, donc chaque appel compte pour ce nombre de minutes.",
    save: "Enregistrer",
    saved: "Enregistré",
    test: "Mode test",
    testLead: "Envoie chaque courriel et texto à l’adresse de test. Chacun indique son vrai destinataire.",
    testEmail: "Courriel de test",
    testPhone: "Téléphone de test (+1…)",
    envFallback: "Vide : réglage Vercel",
    noRecipient: "Ajoutez d’abord un courriel et un téléphone de test. Sans adresse, rien n’est envoyé en mode test.",
    today: "Aujourd’hui",
    channel: "Canal",
    sent: "Comptés",
    blocked: "Arrêtés",
    limit: "Limite",
    changes: "Derniers changements",
    none: "Aucun changement.",
    back: "Retour à l’admin",
    failed: "Échec. Réessayez.",
  },
} as const;

const GROUP_LABEL: Record<Locale, Record<OutboundGroup, string>> = {
  en: {
    sms: "All text messages",
    email: "All automated email",
    push: "All push notifications",
    gov: "All government features",
    paid: "All paid services (video, voice, public API)",
  },
  fr: {
    sms: "Tous les textos",
    email: "Tous les courriels automatiques",
    push: "Toutes les notifications",
    gov: "Toutes les fonctions gouvernement",
    paid: "Tous les services payants (vidéo, voix, API publique)",
  },
};

const CHANNEL_LABEL: Record<Locale, Record<OutboundChannel, string>> = {
  en: { sms: "Texts", email: "Emails", push: "Push notifications", media: "Video and voice minutes" },
  fr: { sms: "Textos", email: "Courriels", push: "Notifications", media: "Minutes vidéo et voix" },
};

export function AdminOutboundPage({
  page,
  locale,
  onSave,
}: {
  page: OutboundPage;
  locale: Locale;
  onSave: (key: string, value: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const c = COPY[locale];
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState<{ key: string; text: string; error: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!page.ok) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border" role="alert">
          {page.error}
        </p>
        <Link to="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {c.back}
        </Link>
      </div>
    );
  }
  const controls = page.controls;

  async function save(key: string, value: string) {
    setBusyKey(key);
    setMessage(null);
    try {
      const r = await onSave(key, value);
      setMessage({ key, text: r.ok ? c.saved : r.error || c.failed, error: !r.ok });
    } catch {
      setMessage({ key, text: c.failed, error: true });
    } finally {
      setBusyKey("");
    }
  }

  const draft = (key: string, fallback: string) => drafts[key] ?? fallback;
  const setDraft = (key: string, value: string) => setDrafts((d) => ({ ...d, [key]: value }));
  const note = (key: string) =>
    message?.key === key ? (
      <span className={message.error ? "text-sm text-danger" : "text-sm text-muted"} role={message.error ? "alert" : "status"}>
        {message.text}
      </span>
    ) : null;

  const usageFor = (ch: OutboundChannel) => page.usage.find((u) => u.channel === ch);
  const testEmail = controls.testEmail || page.envTestEmail;
  const testPhone = controls.testPhone || page.envTestPhone;

  return (
    <div className="space-y-10">
      <section aria-labelledby="ob-switches">
        <h2 id="ob-switches" className="font-display text-xl">{c.switches}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">{c.switchesLead}</p>
        <ul className="mt-4 divide-y divide-border rounded-2xl bg-surface ring-1 ring-border">
          {OUTBOUND_GROUPS.map((g) => {
            const key = CONTROL_KEYS.switch(g);
            const isOn = controls.switches[g];
            return (
              <li key={g} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{GROUP_LABEL[locale][g]}</p>
                  <p className={isOn ? "text-sm text-muted" : "text-sm font-medium text-danger"}>{isOn ? c.on : c.off}</p>
                </div>
                <div className="flex items-center gap-3">
                  {note(key)}
                  <Button
                    variant={isOn ? "secondary" : "primary"}
                    disabled={busyKey === key}
                    aria-pressed={!isOn}
                    onClick={() => void save(key, isOn ? "0" : "1")}
                  >
                    {isOn ? c.turnOff : c.turnOn}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ob-caps">
        <h2 id="ob-caps" className="font-display text-xl">{c.caps}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">{c.capsLead}</p>
        <p className="mt-1 max-w-prose text-sm text-muted">{c.essential}</p>
        <ul className="mt-4 divide-y divide-border rounded-2xl bg-surface ring-1 ring-border">
          {OUTBOUND_CHANNELS.map((ch) => {
            const key = CONTROL_KEYS.cap(ch);
            const id = `ob-${ch}`;
            const used = usageFor(ch);
            return (
              <li key={ch} className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
                <label htmlFor={id} className="min-w-0 text-sm font-medium">
                  {CHANNEL_LABEL[locale][ch]}
                  <span className="block font-normal text-muted tabular-nums">
                    {c.today}: {used?.used ?? 0} / {controls.caps[ch]}
                    {used?.blocked ? ` · ${c.blocked}: ${used.blocked}` : ""}
                  </span>
                </label>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(key, draft(key, String(controls.caps[ch])));
                  }}
                >
                  {note(key)}
                  <input
                    id={id}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft(key, String(controls.caps[ch]))}
                    onChange={(e) => setDraft(key, e.target.value)}
                    className="min-h-11 w-28 rounded-lg bg-bg px-3 text-sm tabular-nums ring-1 ring-border"
                  />
                  <Button type="submit" variant="secondary" disabled={busyKey === key}>
                    {c.save}
                  </Button>
                </form>
              </li>
            );
          })}
          <li className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
            <label htmlFor="ob-per-call" className="min-w-0 max-w-prose text-sm font-medium">
              {c.perCall}
              <span className="block font-normal text-muted">{c.perCallLead}</span>
            </label>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save(CONTROL_KEYS.mediaMinutesPerSession, draft("per-call", String(controls.mediaMinutesPerSession)));
              }}
            >
              {note(CONTROL_KEYS.mediaMinutesPerSession)}
              <input
                id="ob-per-call"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft("per-call", String(controls.mediaMinutesPerSession))}
                onChange={(e) => setDraft("per-call", e.target.value)}
                className="min-h-11 w-20 rounded-lg bg-bg px-3 text-sm tabular-nums ring-1 ring-border"
              />
              <Button type="submit" variant="secondary" disabled={busyKey === CONTROL_KEYS.mediaMinutesPerSession}>
                {c.save}
              </Button>
            </form>
          </li>
        </ul>
      </section>

      <section aria-labelledby="ob-test">
        <h2 id="ob-test" className="font-display text-xl">{c.test}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">{c.testLead}</p>
        <div className="mt-4 space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={controls.testMode ? "text-sm font-medium text-danger" : "text-sm text-muted"}>
              {c.test}: {controls.testMode ? c.on : c.off}
            </p>
            <div className="flex items-center gap-3">
              {note(CONTROL_KEYS.testMode)}
              <Button
                variant={controls.testMode ? "secondary" : "primary"}
                disabled={busyKey === CONTROL_KEYS.testMode}
                aria-pressed={controls.testMode}
                onClick={() => void save(CONTROL_KEYS.testMode, controls.testMode ? "0" : "1")}
              >
                {controls.testMode ? c.turnOff : c.turnOn}
              </Button>
            </div>
          </div>
          {!testEmail || !testPhone ? (
            <p className="text-sm text-danger" role="status">
              {c.noRecipient}
            </p>
          ) : null}
          {(
            [
              [CONTROL_KEYS.testEmail, c.testEmail, controls.testEmail, page.envTestEmail, "email"],
              [CONTROL_KEYS.testPhone, c.testPhone, controls.testPhone, page.envTestPhone, "tel"],
            ] as const
          ).map(([key, label, value, env, type]) => (
            <form
              key={key}
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save(key, draft(key, value));
              }}
            >
              <label className="min-w-0 flex-1 text-sm font-medium">
                {label}
                <input
                  type={type}
                  autoComplete="off"
                  value={draft(key, value)}
                  placeholder={env ? `${c.envFallback}: ${env}` : ""}
                  onChange={(e) => setDraft(key, e.target.value)}
                  className="mt-1 block min-h-11 w-full max-w-md rounded-lg bg-bg px-3 text-sm font-normal ring-1 ring-border"
                />
              </label>
              <Button type="submit" variant="secondary" disabled={busyKey === key}>
                {c.save}
              </Button>
              {note(key)}
            </form>
          ))}
        </div>
      </section>

      <section aria-labelledby="ob-audit">
        <h2 id="ob-audit" className="font-display text-xl">{c.changes}</h2>
        {page.audit.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{c.none}</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {page.audit.map((row) => (
              <li key={`${row.at}-${row.key}`} className="break-words">
                <span className="tabular-nums text-muted">
                  {new Date(row.at).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", { timeZone: "America/Winnipeg" })}
                </span>{" "}
                · {row.who} · {row.key}: {row.from ?? "—"} → {row.to ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link to="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {c.back}
      </Link>
    </div>
  );
}
