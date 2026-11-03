import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { canRegisterWebPush, getAlertsPromptCopy, webPushPermissionAllowed } from "@/lib/alert-push";
import { isNative } from "@/lib/native";
import { useInNativeShell } from "@/lib/use-native-shell";
import { getWebAlertStatus, registerWebPush } from "@/lib/server/alert-push-api";
import { isGovPortalPath } from "@/lib/gov/access";
import { useCopy } from "@/lib/use-copy";
import { readAnalyticsConsent } from "@/lib/analytics-consent";
import { alertPromptAllowed, FIRST_VISIT_QUIET_MS, MEANINGFUL_ACTION_EVENT } from "@/lib/prompt-manager";

const CHOICE_KEY = "ke-web-alert-choice";
const ALERTS_NEXT = "/account?section=alerts&desk=parent";

function vapidKey(): string {
  const env = import.meta.env as { VITE_FCM_VAPID_PUBLIC_KEY?: string };
  return String(env.VITE_FCM_VAPID_PUBLIC_KEY || "").trim();
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Web only. The first view in a tab does not ask. A later view shows Get alerts.
 * The system permission sheet opens only when the browser can register and push is armed.
 */
export function GetAlertsPrompt() {
  const nativeShell = useInNativeShell();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onGovDesk = isGovPortalPath(pathname);
  const { locale } = useCopy();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const copy = getAlertsPromptCopy(locale === "fr" ? "fr" : "en");

  // No floating card on load. Email + in-app alerts are already ON by default (Account > Notification preferences).
  // Push: one short explainer, once ever, right after sign-up or the first save; then the browser sheet.
  useEffect(() => {
    if (typeof window === "undefined" || nativeShell || isNative() || isPending || onGovDesk) return;
    if (!user?.id) return;
    const loadedAt = Date.now();
    const maybeShow = () => {
      const allowed = alertPromptAllowed({
        consent: readAnalyticsConsent(),
        cookieBannerOpen: document.documentElement.dataset.cookieBanner === "open",
        acted: true,
        now: Date.now(),
        snoozeUntil: 0,
        declines: 0,
        choice: window.localStorage.getItem(CHOICE_KEY),
        msSinceLoad: Date.now() - loadedAt + FIRST_VISIT_QUIET_MS,
      });
      if (!allowed) return;
      // Asked once: whatever they pick, never ask again.
      window.localStorage.setItem(CHOICE_KEY, "never");
      setOpen(true);
      void getWebAlertStatus()
        .then((status) =>
          setServerReady(
            webPushPermissionAllowed({
              pushArmed: status.pushArmed,
              vapidPublic: status.vapid,
              vapidPrivate: status.vapidPrivate,
            }),
          ),
        )
        .catch(() => undefined);
    };
    const onAction = (e: Event) => {
      const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === "save" || kind === "signup") maybeShow();
    };
    window.addEventListener(MEANINGFUL_ACTION_EVENT, onAction);
    let signupTimer = 0;
    try {
      if (window.sessionStorage.getItem("ke-just-signed-up")) {
        window.sessionStorage.removeItem("ke-just-signed-up");
        signupTimer = window.setTimeout(maybeShow, 1500);
      }
    } catch {
      /* storage blocked */
    }
    return () => {
      window.clearTimeout(signupTimer);
      window.removeEventListener(MEANINGFUL_ACTION_EVENT, onAction);
    };
  }, [user?.id, isPending, nativeShell, onGovDesk]);

  async function turnOn() {
    if (!user?.id) {
      window.localStorage.setItem(CHOICE_KEY, "email");
      setOpen(false);
      await navigate({ to: "/login", search: parentLoginSearch(ALERTS_NEXT) });
      return;
    }
    const key = vapidKey();
    const supported = canRegisterWebPush({
      notification: typeof Notification !== "undefined",
      pushManager: "PushManager" in window,
      serviceWorker: "serviceWorker" in navigator,
      vapidPublic: Boolean(key),
      pushArmed: serverReady,
    });
    if (!supported) {
      window.localStorage.setItem(CHOICE_KEY, "email");
      setOpen(false);
      toast(copy.unsupported);
      await navigate({ to: "/account", search: { tab: "profile", section: "alerts", desk: "parent" } });
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        window.localStorage.setItem(CHOICE_KEY, "no");
        setOpen(false);
        return;
      }
      await navigator.serviceWorker.register("/sw.js?v=8", { scope: "/", updateViaCache: "none" });
      const ready = await navigator.serviceWorker.ready;
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON();
      const saved = await registerWebPush({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh || "",
          authKey: json.keys?.auth || "",
          locale: locale === "fr" ? "fr" : "en",
        },
      });
      if (!saved.ok) {
        toast(copy.unsupported);
        return;
      }
      window.localStorage.setItem(CHOICE_KEY, "yes");
      setOpen(false);
    } catch {
      window.localStorage.setItem(CHOICE_KEY, "email");
      setOpen(false);
      toast(copy.unsupported);
    }
  }

  function notNow() {
    window.localStorage.setItem(CHOICE_KEY, "never");
    setOpen(false);
  }

  if (nativeShell || onGovDesk || !open) return null;

  return (
    <div
      data-ke="push-explainer"
      role="dialog"
      aria-label={copy.title}
      className="ke-bottom-prompt fixed inset-x-0 bottom-0 z-[55] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] [[data-channel=app]_&]:bottom-[calc(4.25rem+var(--ke-safe-bottom,env(safe-area-inset-bottom)))]"
    >
      <div className="mx-auto flex max-w-[560px] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface/95 px-3 py-2 shadow-lift ring-1 ring-border backdrop-blur-md">
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-xs font-semibold leading-4 text-fg">{copy.title}</p>
          <p className="text-[11px] leading-4 text-muted">{copy.body}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
          <Button variant="secondary" className="min-h-10 px-3 text-sm" onClick={notNow}>
            {copy.no}
          </Button>
          <Button className="min-h-10 px-3 text-sm" onClick={() => void turnOn()}>
            {copy.yes}
          </Button>
        </div>
      </div>
    </div>
  );
}
