import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { getLabStatus, type LabStatus } from "@/lib/server/chat-scaffold";
import { dryRunPush } from "@/lib/server/push-api";
import { CHAT_SCAFFOLD_EMPTY, CHAT_SCAFFOLD_MESSAGE } from "@/lib/chat-scaffold";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { canSeeAdminDesk } from "@/lib/desks";

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

  const admin = Boolean(ready && canSeeAdminDesk(session?.role) && session?.desks.includes("admin"));

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
          <dl className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="FEATURE_INAPP_CHAT"
              value={flagValue(lab?.chat.enabled)}
              hint={`${sourceHint(lab?.chat.source)}Flag only. Composer and delivery are not built.`}
            />
            <Stat
              label="FEATURE_PUSH"
              value={flagValue(lab?.push.enabled)}
              hint={pushHint(lab, dryRunHint)}
            />
            <Stat
              label="FEATURE_SMS"
              value={flagValue(lab?.sms.enabled)}
              hint={smsHint(lab)}
            />
            <Stat
              label="FEATURE_VIDEO"
              value={flagValue(lab?.video.enabled)}
              hint={videoHint(lab)}
            />
            <Stat
              label="FEATURE_PROVIDER_SUBSCRIPTIONS"
              value={flagValue(lab?.subscriptions.enabled)}
              hint={`${sourceHint(lab?.subscriptions.source)}Directors see the Subscription tab when on.`}
            />
          </dl>
          <div className="rounded-2xl bg-surface px-5 py-6 text-sm text-muted ring-1 ring-border">
            <p>
              Live parent ↔ centre messages stay on{" "}
              <Link to="/inbox" className="text-fg underline">
                /inbox
              </Link>
              .
            </p>
            <p className="mt-2">
              No Stream or Sendbird. Types live in <code>src/lib/chat-scaffold.ts</code>.
            </p>
            <p className="mt-2">
              Parent Plus video tours:{" "}
              <Link to="/video/$roomId" params={{ roomId: "lab" }} className="text-fg underline">
                /video/lab
              </Link>
              . Flag and env presence only — no secrets.
            </p>
            <p className="mt-2">
              Push is native-only (<code>docs/push.md</code>). www does not prompt.
              Live FCM / APNs stays off until the flag is on and credentials exist.
            </p>
            <p className="mt-2">
              Flags: {remoteHint(lab)}. Kyle flips them in PostHog without a redeploy —
              see <code>docs/flags.md</code>. <code>FEATURE_PUSH</code> and{" "}
              <code>FEATURE_SMS</code> stay off until you enable them.
            </p>
            <button
              type="button"
              className="mt-3 rounded-full bg-fg px-4 py-2 text-sm text-bg"
              onClick={() => {
                void dryRunPush({ data: {} })
                  .then((result) => {
                    setDryRunHint(`Dry-run: ${result.tokenCount} token(s). Nothing sent.`);
                  })
                  .catch(() => setDryRunHint("Dry-run failed."));
              }}
            >
              Dry-run push (count tokens)
            </button>
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
  if (lab.video.credentialsPresent) {
    return `${source}${key}. Account SID present. Values are not shown.`;
  }
  return `${source}No Twilio Video credentials (${key}; SID ${p.accountSid ? "present" : "missing"}). Do not invent SID or secret values.`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-4 ring-1 ring-border">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-2 font-display text-2xl">{value}</dd>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
