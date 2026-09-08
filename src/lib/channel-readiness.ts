/**
 * Safe enablement for FEATURE_SMS / FEATURE_PUSH / FEATURE_VIDEO.
 *
 * Production (VERCEL_ENV=production): a flag is ignored unless the required
 * vendor secrets are present. Preview and local may set FEATURE_*=1 to
 * exercise UI without live vendors — send / mint / native prompt still
 * no-op without credentials.
 *
 * Parent-facing chrome only appears when that channel has a real backend.
 * Video token mint exists, but VIDEO_SDK_WIRED is false, so inbox Video
 * stays hidden even if the flag is on.
 *
 * No @/ imports — scripts/channel-readiness.test.mjs loads this file in Node.
 */

import { evaluateFeatureFlag, envMap, type EnvMap } from "./flags.ts";
import { pushCredentialsPresent } from "./push.ts";
import { smsCredentialsPresent } from "./sms.ts";
import { VIDEO_SDK_WIRED, videoCredentialsPresent } from "./video.ts";

export type ChannelId = "sms" | "push" | "video";

export type ChannelFlagKey = "FEATURE_SMS" | "FEATURE_PUSH" | "FEATURE_VIDEO";

export type ChannelBlockReason =
  | "flag_off"
  | "production_requires_secrets"
  | "no_credentials"
  | "sdk_not_wired";

export type ChannelReadiness = {
  id: ChannelId;
  flagKey: ChannelFlagKey;
  flagOn: boolean;
  credentialsPresent: boolean;
  production: boolean;
  /** Flag may take effect. Production requires secrets; Preview/dev may override. */
  armed: boolean;
  /** Vendor send / mint may run. Always requires credentials. */
  sendEnabled: boolean;
  /** Parent/provider chrome may present this channel as available. */
  surfaceEnabled: boolean;
  sdkWired: boolean | null;
  reason: ChannelBlockReason | null;
};

const FLAG_BY_CHANNEL: Record<ChannelId, ChannelFlagKey> = {
  sms: "FEATURE_SMS",
  push: "FEATURE_PUSH",
  video: "FEATURE_VIDEO",
};

export function vercelEnvName(env?: EnvMap): string {
  return String(envMap(env).VERCEL_ENV || "")
    .trim()
    .toLowerCase();
}

/** True only on Vercel Production. Preview, development, and unset are overrides. */
export function isVercelProduction(env?: EnvMap): boolean {
  return vercelEnvName(env) === "production";
}

function credentialsFor(id: ChannelId, env: EnvMap): boolean {
  if (id === "sms") return smsCredentialsPresent(env);
  if (id === "push") return pushCredentialsPresent(env);
  return videoCredentialsPresent(env);
}

export function describeChannelReadiness(id: ChannelId, env?: EnvMap): ChannelReadiness {
  const mapped = envMap(env);
  const flagKey = FLAG_BY_CHANNEL[id];
  const flagOn = evaluateFeatureFlag(flagKey, mapped);
  const credentialsPresent = credentialsFor(id, mapped);
  const production = isVercelProduction(mapped);
  const sdkWired = id === "video" ? VIDEO_SDK_WIRED : null;
  const armed = Boolean(flagOn && (!production || credentialsPresent));
  const sendEnabled = Boolean(flagOn && credentialsPresent);
  const surfaceEnabled = id === "video" ? Boolean(armed && VIDEO_SDK_WIRED) : armed;

  let reason: ChannelBlockReason | null = null;
  if (!flagOn) reason = "flag_off";
  else if (production && !credentialsPresent) reason = "production_requires_secrets";
  else if (id === "video" && !VIDEO_SDK_WIRED) reason = "sdk_not_wired";
  else if (!credentialsPresent) reason = "no_credentials";

  return {
    id,
    flagKey,
    flagOn,
    credentialsPresent,
    production,
    armed,
    sendEnabled,
    surfaceEnabled,
    sdkWired,
    reason,
  };
}

export function listChannelReadiness(env?: EnvMap): ChannelReadiness[] {
  return (["sms", "push", "video"] as const).map((id) => describeChannelReadiness(id, env));
}

export function smsArmed(env?: EnvMap): boolean {
  return describeChannelReadiness("sms", env).armed;
}

export function smsSendEnabled(env?: EnvMap): boolean {
  return describeChannelReadiness("sms", env).sendEnabled;
}

export function pushArmed(env?: EnvMap): boolean {
  return describeChannelReadiness("push", env).armed;
}

export function pushSendEnabled(env?: EnvMap): boolean {
  return describeChannelReadiness("push", env).sendEnabled;
}

export function videoArmed(env?: EnvMap): boolean {
  return describeChannelReadiness("video", env).armed;
}

export function videoSurfaceEnabled(env?: EnvMap): boolean {
  return describeChannelReadiness("video", env).surfaceEnabled;
}

export function videoSendEnabled(env?: EnvMap): boolean {
  return describeChannelReadiness("video", env).sendEnabled;
}
