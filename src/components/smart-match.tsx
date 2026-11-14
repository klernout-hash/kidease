import { lazy, Suspense, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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

export function SmartMatchEntry({ inline = false, quiet = false, card = false }: { inline?: boolean; quiet?: boolean; card?: boolean }) {
  const { user } = useCurrentUserState();
  const { t, locale } = useCopy();
  const on = useAiFeatureFlag(AI_FLAGS.smartMatch);
  const [open, setOpen] = useState(false);

  const button = card ? (
    <Button
      type="button"
      className="min-h-[44px] min-w-[44px] shrink-0 rounded-md px-5 touch-manipulation max-sm:w-full"
      data-ke="smart-match-open"
      data-flag={on ? "on" : "off"}
    >
      {locale === "fr" ? "Trouver ma garderie" : "Find my match"} <span aria-hidden="true">→</span>
    </Button>
  ) : quiet ? (
    <button
      type="button"
      className="inline-flex min-h-[44px] min-w-[44px] items-center px-1 text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 touch-manipulation"
      data-ke="smart-match-open"
      data-flag={on ? "on" : "off"}
    >
      {t("smartMatchCta")}
    </button>
  ) : (
    <Button
      type="button"
      variant="secondary"
      className="min-h-[44px] min-w-[44px] whitespace-nowrap max-md:h-auto max-md:max-w-full max-md:whitespace-normal max-md:px-4 max-md:text-center"
      data-ke="smart-match-open"
      data-flag={on ? "on" : "off"}
    >
      {t("smartMatchCta")}
    </Button>
  );
  const trigger = <Dialog.Trigger asChild>{button}</Dialog.Trigger>;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {card ? (
        <section
          data-ke="smart-match-card"
          className="mx-auto mt-4 flex w-full max-w-[960px] flex-col gap-4 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug text-fg">
              {locale === "fr" ? "Besoin d’aide pour trouver la bonne garderie?" : "Need help finding the right daycare?"}
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              {locale === "fr" ? "Répondez à 5 questions pour explorer les options pour votre famille." : "Answer 5 quick questions to explore options for your family."}
            </p>
          </div>
          {trigger}
        </section>
      ) : inline ? trigger : <div className="mt-3 flex justify-center">{trigger}</div>}
      {open ? <SmartMatchDialog onClose={() => setOpen(false)} signedIn={Boolean(user)} visitorId={user?.id} /> : null}
    </Dialog.Root>
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
  const panelRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    capturePostHogEvent("smart_match_started", {});
  }, []);

  return (
    <Dialog.Portal>
    <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center" role="presentation">
      <Dialog.Overlay asChild>
        <button type="button" tabIndex={-1} className="absolute inset-0 bg-fg/40" aria-label={t("close")} onClick={onClose} />
      </Dialog.Overlay>
      <Dialog.Content
        asChild
        aria-modal="true"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panelRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          // The drawer also listens for Escape; close only this top dialog.
          event.stopPropagation();
        }}
      >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-ke="smart-match-chat"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-bg shadow-card ring-1 ring-border outline-none md:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Dialog.Title asChild>
          <h2 className="font-display text-xl">
            {t("smartMatchTitle")}
          </h2>
          </Dialog.Title>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>
        <Suspense fallback={<SmartMatchChatLoading />}>
          <SmartMatchChat onClose={onClose} signedIn={signedIn} visitorId={visitorId} />
        </Suspense>
      </div>
      </Dialog.Content>
    </div>
    </Dialog.Portal>
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
