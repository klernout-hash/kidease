import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { canRegisterWebPush, getAlertsPromptCopy, webAlertPromptStep } from "@/lib/alert-push";
import { isNative } from "@/lib/native";
import { getWebAlertStatus, registerWebPush } from "@/lib/server/alert-push-api";
import { useCopy } from "@/lib/use-copy";

const CHOICE_KEY = "ke-web-alert-choice";
const SEEN_KEY = "ke-web-alert-seen";
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
  const { locale } = useCopy();
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const copy = getAlertsPromptCopy(locale === "fr" ? "fr" : "en");

  useEffect(() => {
    if (typeof window === "undefined" || isNative()) return;
    const choice = window.localStorage.getItem(CHOICE_KEY);
    const seen = window.sessionStorage.getItem(SEEN_KEY);
    if (!seen) {
      window.sessionStorage.setItem(SEEN_KEY, "1");
      return;
    }
    if (webAlertPromptStep({ native: false, choice, seenThisVisit: true }) !== "show") return;
    setOpen(true);
    void getWebAlertStatus()
      .then((status) => setArmed(status.pushArmed && status.vapid))
      .catch(() => undefined);
  }, [user?.id]);

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
      pushArmed: armed,
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
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
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
    window.localStorage.setItem(CHOICE_KEY, "no");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 px-4">
      <div className="mx-auto w-full max-w-lg rounded-2xl bg-surface p-4 shadow-card ring-1 ring-border">
        <p className="text-base font-semibold text-fg">{copy.title}</p>
        <p className="mt-1 text-sm text-muted">{copy.body}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Button className="min-h-11 w-full" onClick={() => void turnOn()}>
            {user?.id ? copy.yes : copy.signIn}
          </Button>
          <Button variant="secondary" className="min-h-11 w-full" onClick={notNow}>
            {copy.no}
          </Button>
        </div>
      </div>
    </div>
  );
}
