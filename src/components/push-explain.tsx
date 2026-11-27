import { useEffect, useId, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { shouldShowAnalyticsConsentBanner } from "@/lib/analytics-consent";
import { isNative } from "@/lib/native";
import { nativeShellPrompt } from "@/lib/native-prompt";
import { registerPushDevice } from "@/lib/push-client";
import { pushExplainCopy, pushPromptStep } from "@/lib/push-prompt";
import { useCopy } from "@/lib/use-copy";
import type { AlertAudience } from "@/lib/alert-push";

const SEEN_KEY = "ke-native-opened";
const CHOICE_KEY = "ke-push-choice";

function useSamsungPush() {
  return useRouterState({
    select: (state) => state.matches.some((match) => (match.context as { samsungPush?: boolean }).samsungPush === true),
  });
}

/** A returning session may restore prior opt-in, but it never shows an explainer or asks the OS. */
export function PushRegistrationBoot() {
  const { user } = useCurrentUserState();
  const samsungPush = useSamsungPush();
  useEffect(() => {
    if (!isNative() || !user?.id) return;
    let cancelled = false;
    void (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const seen = await Preferences.get({ key: SEEN_KEY });
      if (!seen.value) {
        await Preferences.set({ key: SEEN_KEY, value: "1" });
        return;
      }
      const choice = await Preferences.get({ key: CHOICE_KEY });
      if (choice.value !== "yes" || cancelled) return;
      const { getPushClientStatus } = await import("@/lib/server/push-api");
      const status = await getPushClientStatus();
      if (cancelled) return;
      if (pushPromptStep({ enabled: status.enabled, firstLaunch: false, choice: choice.value }) === "register") {
        await registerPushDevice({ enabled: true, allowPermissionPrompt: false, samsungFallback: samsungPush });
      }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [user?.id, samsungPush]);
  return null;
}

/** In-flow card shown only when a signed-in native user opens phone notification settings. */
export function PushExplain({ audience }: { audience: AlertAudience }) {
  const { user } = useCurrentUserState();
  if (!user?.id) return null;
  return <PushChoice key={user.id} audience={audience} />;
}

function PushChoice({ audience }: { audience: AlertAudience }) {
  const { t, locale } = useCopy();
  const copy = pushExplainCopy(audience, locale);
  const samsungPush = useSamsungPush();
  const title = useId();
  const [eligible, setEligible] = useState(false);
  const [consentSettled, setConsentSettled] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    const refreshConsent = () => setConsentSettled(!shouldShowAnalyticsConsentBanner() && !document.documentElement.dataset.cookieBanner);
    refreshConsent();
    const observer = new MutationObserver(refreshConsent);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-cookie-banner"] });
    void (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const choice = await Preferences.get({ key: CHOICE_KEY });
      if (choice.value === "yes" || choice.value === "no" || cancelled) return;
      const { getPushClientStatus } = await import("@/lib/server/push-api");
      const status = await getPushClientStatus();
      if (!cancelled) setEligible(status.enabled === true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  async function choose(value: "yes" | "no") {
    if (busy || !consentSettled || shouldShowAnalyticsConsentBanner() || document.documentElement.dataset.cookieBanner) return;
    setBusy(true);
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: CHOICE_KEY, value });
      setEligible(false);
      setOpened(false);
      if (value === "yes") await registerPushDevice({ enabled: true, samsungFallback: samsungPush });
    } finally {
      setBusy(false);
    }
  }

  if (nativeShellPrompt({ native: isNative(), consentUnset: !consentSettled, pushExplain: eligible }) !== "push") return null;

  return opened ? (
    <section data-ke="push-explain" aria-labelledby={title} className="mt-4 rounded-xl bg-bg p-3 ring-1 ring-border">
      <h3 id={title} className="text-base font-semibold text-fg">{copy.title}</h3>
      <p className="mt-1 text-sm text-muted">{copy.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={busy} onClick={() => void choose("yes").catch(() => undefined)}>
          {t("pushExplainYes")}
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => void choose("no").catch(() => undefined)}>
          {t("pushExplainNo")}
        </Button>
      </div>
    </section>
  ) : (
    <Button type="button" variant="outline" className="mt-4 min-h-11" data-ke="push-explain-open" onClick={() => setOpened(true)}>
      {copy.title}
    </Button>
  );
}
