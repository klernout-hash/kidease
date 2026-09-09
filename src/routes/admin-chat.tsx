import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { getLabStatus, type LabStatus } from "@/lib/server/chat-scaffold";
import { dryRunPush } from "@/lib/server/push-api";
import {
  CHAT_COMING_SOON_TITLE,
  CHAT_COMPOSER_PLACEHOLDER,
  CHAT_SCAFFOLD_EMPTY,
  CHAT_SCAFFOLD_MESSAGE,
  chatComposerState,
} from "@/lib/chat-scaffold";
import { FEATURE_FLAG_CATALOG } from "@/lib/flags";
import { FCM_LAB_NEXT_STEPS } from "@/lib/push";
import { TWILIO_VIDEO_LAB_NEXT_STEPS } from "@/lib/video";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { canVisitDesk } from "@/lib/desks";

export const Route = createFileRoute("/admin-chat")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Chat lab · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminChatPage,
});

function AdminChatPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const [lab, setLab] = useState<LabStatus | null>(null);
  const [dryRunHint, setDryRunHint] = useState("");

  const admin = Boolean(ready && session && canVisitDesk(session.desks, "admin", session.role));

  useEffect(() => {
    if (!user || !admin) return;
    void getLabStatus()
      .then(setLab)
      .catch(() => setLab(null));
  }, [user, admin]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!ready) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!admin) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This page is only for KidEase staff with profiles.role = admin.</p>
        </main>
      </Shell>
    );
  }

  const composer = lab?.chat.composer ?? chatComposerState(false);
  const pushSteps = lab?.push.nextSteps ?? FCM_LAB_NEXT_STEPS;
  const videoSteps = lab?.video.nextSteps ?? TWILIO_VIDEO_LAB_NEXT_STEPS;

  return (
    <TwoFactorGate next="/admin-chat">
      <DeskShell
        desk="admin"
        active="chat"
        onSelect={(id) => {
          if (id !== "chat" && typeof window !== "undefined") window.location.assign("/admin");
        }}
      >
        <section className="space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Scaffold only</p>
            <h2 className="mt-2 font-display text-2xl">Chat lab</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">{CHAT_SCAFFOLD_MESSAGE}</p>
            {lab === null ? <p className="mt-3 text-sm text-warn">{CHAT_SCAFFOLD_EMPTY}</p> : null}
          </div>

          <div className="rounded-2xl bg-surface px-5 py-5 ring-1 ring-border">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{CHAT_COMING_SOON_TITLE}</p>
            <p className="mt-2 font-medium">
              {lab?.chat.enabled ? "FEATURE_INAPP_CHAT on · not live" : "FEATURE_INAPP_CHAT off"}
            </p>
            <p className="mt-2 text-sm text-muted">{composer.message}</p>
            <form
              aria-disabled="true"
              aria-label="In-app chat composer (disabled)"
              className="mt-4 flex flex-col gap-2"
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="flex gap-2">
                <input
                  disabled
                  readOnly
                  value=""
                  placeholder={CHAT_COMPOSER_PLACEHOLDER}
                  aria-label="Chat composer (disabled)"
                  className="h-12 flex-1 rounded-md border border-border bg-surface-2 px-3 text-muted"
                />
                <Button type="submit" disabled>
                  Send
                </Button>
              </div>
              <p className="text-xs text-subtle">No delivery. This form cannot send, store, or fake a thread.</p>
            </form>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="FEATURE_INAPP_CHAT"
              value={flagValue(lab?.chat.enabled)}
              state={flagState(lab?.chat.enabled, false)}
              hint={`${sourceHint(lab?.chat.source)}Flag only. Composer and delivery are not built.`}
            />
            <Stat
              label="FEATURE_PUSH"
              value={flagValue(lab?.push.enabled)}
              state={channelState(lab?.push)}
              hint={pushHint(lab, dryRunHint)}
            />
            <Stat
              label="FEATURE_SMS"
              value={flagValue(lab?.sms.enabled)}
              state={channelState(lab?.sms)}
              hint={smsHint(lab)}
            />
            <Stat
              label="FEATURE_VIDEO"
              value={flagValue(lab?.video.enabled)}
              state={channelState(lab?.video)}
              hint={videoHint(lab)}
            />
            <Stat
              label="FEATURE_PROVIDER_SUBSCRIPTIONS"
              value={flagValue(lab?.subscriptions.enabled)}
              state={flagState(lab?.subscriptions.enabled, true)}
              hint={`${sourceHint(lab?.subscriptions.source)}Directors see the Subscription tab when on.`}
            />
            <Stat
              label="SHOW_PAY_CTAS"
              value={flagValue(lab?.payCtas.enabled)}
              state={flagState(lab?.payCtas.enabled, false)}
              hint={`${sourceHint(lab?.payCtas.source)}Parent and director Upgrade / Subscribe chrome. Default off. Admin Stripe stays.`}
            />
          </dl>

          <div className="rounded-2xl bg-surface px-5 py-6 text-sm ring-1 ring-border">
            <h3 className="font-display text-xl">Flag names</h3>
            <p className="mt-2 text-muted">
              Keys must match env and PostHog exactly. See <code>docs/flags.md</code> and{" "}
              <code>docs/chat.md</code>. Secret values are never shown.
            </p>
            <ul className="mt-4 space-y-3">
              {FEATURE_FLAG_CATALOG.map((row) => (
                <li key={row.key} className="rounded-xl bg-surface-2 px-4 py-3">
                  <p className="font-mono text-sm">
                    {row.key}
                    <span className="ml-2 text-xs text-muted">
                      default {row.defaultOn ? "on" : "off"} · {row.docs}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">{row.summary}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-muted">Flags: {remoteHint(lab)}. Kyle flips them in PostHog without a redeploy.</p>
          </div>

          <div className="rounded-2xl bg-surface px-5 py-6 text-sm ring-1 ring-border">
            <h3 className="font-display text-xl">SMS · Twilio Programmable SMS</h3>
            <p className="mt-2 text-muted">
              {lab?.sms.sendEnabled
                ? "FEATURE_SMS is armed and Twilio send credentials are present. User texts still need a stored CASL grant. This is Messages API, not Twilio Verify."
                : lab?.sms.armed
                  ? "Preview override — FEATURE_SMS is on, but send no-ops until Twilio credentials exist. Production would stay off without secrets."
                  : "Coming soon — FEATURE_SMS is off in Production until Twilio + CASL are ready. Consent capture stays on so flipping later is safe."}
            </p>
            <p className="mt-2 text-xs text-muted">
              Production stays off unless secrets exist. Preview/dev may set FEATURE_SMS=1 to test UI. See{" "}
              <code>docs/sms.md</code>.
            </p>
          </div>

          <div className="rounded-2xl bg-surface px-5 py-6 text-sm ring-1 ring-border">
            <h3 className="font-display text-xl">Push · FCM / APNs</h3>
            <p className="mt-2 text-muted">
              {lab?.push.enabled
                ? "FEATURE_PUSH is on. Live send still needs credentials and a native binary. Dry-run does not send."
                : "Coming soon — FEATURE_PUSH is off. Dry-run counts tokens only. www does not prompt."}
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted">
              {pushSteps.map((step) => (
                <li key={step.id}>
                  <span className="font-medium text-fg">{step.title}.</span> {step.detail}
                </li>
              ))}
            </ol>
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              onClick={() => {
                void dryRunPush({ data: {} })
                  .then((result) => {
                    setDryRunHint(`Dry-run: ${result.tokenCount} token(s). Nothing sent.`);
                  })
                  .catch(() => setDryRunHint("Dry-run failed."));
              }}
            >
              Dry-run push (count tokens)
            </Button>
            {dryRunHint ? <p className="mt-2 text-xs text-muted">{dryRunHint}</p> : null}
          </div>

          <div className="rounded-2xl bg-surface px-5 py-6 text-sm ring-1 ring-border">
            <h3 className="font-display text-xl">Video · Twilio Video</h3>
            <p className="mt-2 text-muted">
              {lab?.video.enabled
                ? "FEATURE_VIDEO is on. The browser SDK is still not attached — /video/lab does not start a live call or charge."
                : "Coming soon — FEATURE_VIDEO is off. Flag and env presence only. No secrets. No charge."}
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted">
              {videoSteps.map((step) => (
                <li key={step.id}>
                  <span className="font-medium text-fg">{step.title}.</span> {step.detail}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-muted">
              Lab room:{" "}
              <Link to="/video/$roomId" params={{ roomId: "lab" }} className="text-fg underline">
                /video/lab
              </Link>
              . Live parent ↔ centre messages stay on{" "}
              <Link to="/inbox" className="text-fg underline">
                /inbox
              </Link>
              .
            </p>
          </div>

          <div className="rounded-2xl bg-surface px-5 py-6 text-sm text-muted ring-1 ring-border">
            <p>No Stream or Sendbird. Types live in <code>src/lib/chat-scaffold.ts</code>.</p>
            <p className="mt-2">
              Push is native-only (<code>docs/push.md</code>). Video SDK attach is later (
              <code>docs/video.md</code>). <code>FEATURE_PUSH</code> and <code>FEATURE_VIDEO</code> stay off
              until you enable them.
            </p>
          </div>
        </section>
      </DeskShell>
    </TwoFactorGate>
  );
}

function flagValue(enabled: boolean | undefined): string {
  if (enabled == null) return "…";
  return enabled ? "on" : "off";
}

function flagState(enabled: boolean | undefined, liveWhenOn: boolean): string {
  if (enabled == null) return "";
  if (!enabled) return "Coming soon · feature flag off";
  return liveWhenOn ? "Live when Stripe keys exist" : "Flag on · not a live product";
}

function channelState(channel: LabStatus["sms"] | LabStatus["push"] | LabStatus["video"] | undefined): string {
  if (!channel) return "";
  if (!channel.enabled) return "Coming soon · feature flag off";
  if (channel.reason === "production_requires_secrets") return "Production blocked · secrets missing";
  if (channel.reason === "sdk_not_wired") {
    return channel.sendEnabled ? "Flag on · SDK not attached (inbox hidden)" : "Flag on · SDK not attached";
  }
  if (channel.sendEnabled) return "Armed · vendor send ready";
  if (channel.armed && !channel.credentialsPresent) return "Preview override · send no-ops (no secrets)";
  return "Flag on · not a live product";
}

function sourceHint(source: LabStatus["chat"]["source"] | undefined): string {
  if (source === "remote") return "Source: PostHog. ";
  if (source === "env") return "Source: env. ";
  if (source === "default") return "Source: default. ";
  return "";
}

function remoteHint(lab: LabStatus | null): string {
  if (!lab) return "remote status not loaded";
  if (lab.remote.provider === "none") return "PostHog remote unset — env only";
  if (!lab.remote.ok) return "PostHog remote configured, last fetch failed — using env fallback";
  return "PostHog remote configured";
}

function pushHint(lab: LabStatus | null, dryRunHint: string): string {
  if (dryRunHint) return dryRunHint;
  if (!lab) return "FCM / APNs env not loaded. Do not invent keys.";
  const tokens = `${lab.push.tokenCount} stored token(s)`;
  const source = sourceHint(lab.push.source);
  if (lab.push.credentialsPresent) {
    return `${source}${tokens}. Env names are present. Send stays off until the flag is on.`;
  }
  return `${source}${tokens}. No FCM / APNs credentials. Do not invent keys.`;
}

function smsHint(lab: LabStatus | null): string {
  if (!lab) return "Twilio env not loaded. Do not invent credentials.";
  const p = lab.sms.presence;
  const sender = p.messagingService ? "Messaging Service present" : p.fromNumber ? "From number present" : "no Canadian sender / Messaging Service";
  const auth = p.authMode === "api_key" ? "API key present" : p.authMode === "auth_token" ? "auth token present" : "no auth";
  const source = sourceHint(lab.sms.source);
  if (lab.sms.credentialsPresent) {
    return `${source}${auth}. ${sender}. Values are not shown.`;
  }
  return `${source}No Twilio send credentials (${auth}; ${sender}). Do not invent SID or token values.`;
}

function videoHint(lab: LabStatus | null): string {
  if (!lab) return "Twilio Video env not loaded. Do not invent credentials.";
  const p = lab.video.presence;
  const key = p.apiKey ? "API key present" : "no API key (tokens need TWILIO_API_KEY_SID + SECRET)";
  const source = sourceHint(lab.video.source);
  const sdk = lab.video.sdkWired ? "SDK wired." : "Twilio Video SDK not attached.";
  if (lab.video.credentialsPresent) {
    return `${source}${key}. Account SID present. ${sdk} Values are not shown.`;
  }
  return `${source}No Twilio Video credentials (${key}; SID ${p.accountSid ? "present" : "missing"}). ${sdk} Do not invent SID or secret values.`;
}

function Stat({
  label,
  value,
  hint,
  state,
}: {
  label: string;
  value: string;
  hint: string;
  state: string;
}) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-4 ring-1 ring-border">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-2 font-display text-2xl">{value}</dd>
      {state ? <p className="mt-1 text-xs font-medium text-fg">{state}</p> : null}
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
