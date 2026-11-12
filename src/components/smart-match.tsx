import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AI_FLAGS } from "@/lib/ai/flags";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { capturePostHogEvent } from "@/lib/posthog";
import { standardAgeLabel } from "@/lib/standard-age-groups";
import { useCopy } from "@/lib/use-copy";

const SmartMatchChat = lazy(() =>
  import("@/components/smart-match-chat").then((m) => ({ default: m.SmartMatchChat })),
);

function chatTabStops(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>("a[href], button, select, textarea, input, [tabindex]"),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[inert]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
}

export function SmartMatchEntry({
  inline = false,
  quiet = false,
}: {
  inline?: boolean;
  quiet?: boolean;
}) {
  const { user } = useCurrentUserState();
  const { t } = useCopy();
  const on = useAiFeatureFlag(AI_FLAGS.smartMatch);
  const [open, setOpen] = useState(false);

  const button = quiet ? (
    <button
      type="button"
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-1 text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 touch-manipulation"
      data-ke="smart-match-open"
      data-flag={on ? "on" : "off"}
      onClick={() => setOpen(true)}
    >
      {t("smartMatchCta")}
    </button>
  ) : (
    <Button
      type="button"
      variant="secondary"
      className="whitespace-nowrap max-md:h-auto max-md:max-w-full max-md:whitespace-normal max-md:px-4 max-md:text-center"
      data-ke="smart-match-open"
      data-flag={on ? "on" : "off"}
      onClick={() => setOpen(true)}
    >
      {t("smartMatchCta")}
    </Button>
  );

  return (
    <>
      {inline ? button : <div className="mt-3 flex justify-center">{button}</div>}
      {open ? (
        <SmartMatchDialog
          onClose={() => setOpen(false)}
          signedIn={Boolean(user)}
          visitorId={user?.id}
        />
      ) : null}
    </>
  );
}

function SmartMatchDialog({
  onClose,
  signedIn,
  visitorId,
}: {
  onClose: () => void;
  signedIn: boolean;
  visitorId?: string | null;
}) {
  const { t } = useCopy();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const started = useRef(false);

  // Focus, dismissal, and scroll locking are immediate, even on a slow chunk.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      capturePostHogEvent("smart_match_started", {});
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      // Keep an outer navigation drawer from handling this dialog's Tab key.
      event.stopPropagation();
      const stops = chatTabStops(panelRef.current);
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const active = document.activeElement;
      if (!stops.includes(active as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center md:items-center"
      role="presentation"
    >
      <div className="absolute inset-0 bg-fg/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-ke="smart-match-chat"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-bg shadow-card ring-1 ring-border outline-none md:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-display text-xl">
            {t("smartMatchTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>
        <Suspense fallback={<SmartMatchChatLoading />}>
          <SmartMatchChat onClose={onClose} signedIn={signedIn} visitorId={visitorId} />
        </Suspense>
      </div>
    </div>
  );
}

/** The first question reserves the same space while the editor chunk arrives. */
function SmartMatchChatLoading() {
  const { t, locale } = useCopy();
  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        role="status"
        aria-live="polite"
        aria-label={t("loading")}
      >
        {(["smartMatchLead", "smartMatchAge"] as const).map((key) => (
          <p
            key={key}
            aria-hidden="true"
            className="max-w-[85%] self-start whitespace-pre-line rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-snug text-fg ring-1 ring-border"
          >
            {t(key)}
          </p>
        ))}
      </div>
      <div
        className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-hidden="true"
      >
        <div className="mb-2 flex flex-wrap gap-[8px]">
          {(["infant", "toddler", "preschool", "school-age", "any"] as const).map((age) => (
            <button
              key={age}
              type="button"
              disabled
              className="min-h-[44px] min-w-[44px] whitespace-nowrap rounded-full bg-surface px-4 text-sm font-medium text-fg ring-1 ring-border touch-manipulation"
            >
              {age === "any" ? t("anyAge") : standardAgeLabel(age, locale)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-[8px] rounded-full bg-surface px-1.5 py-1 ring-1 ring-border">
          <input
            disabled
            placeholder={t("smartMatchTypeAnswer")}
            className="h-11 min-h-[44px] min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
          />
          <button
            type="button"
            disabled
            className="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full bg-fg text-bg opacity-40"
          >
            <ArrowUp className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mt-2 flex gap-[8px]">
          <Button type="button" variant="secondary" disabled>
            {t("back")}
          </Button>
          <Button type="button" variant="ghost" disabled>
            {t("smartMatchRestart")}
          </Button>
        </div>
      </div>
    </>
  );
}
