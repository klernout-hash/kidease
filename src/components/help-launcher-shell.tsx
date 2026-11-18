import { lazy, Suspense, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { helpLauncherVisible } from "@/lib/help-launcher";
import { useCopy } from "@/lib/use-copy";

const HelpBotPanel = lazy(() =>
  import("@/components/help-bot").then((m) => ({ default: m.HelpBotPanel })),
);

/** Navigation dismisses even a panel whose lazy import is still in flight. */
export function LiveChatSlot() {
  const location = useRouterState({ select: (s) => s.location });
  if (!helpLauncherVisible(location.pathname)) return null;
  return <HelpLauncher key={location.href} />;
}

/** Keep the dialog shell available while the chat code loads. */
function HelpLauncher() {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="ke-help-bot" data-ke="help-launcher">
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="flex min-h-11 min-w-11 touch-manipulation select-none flex-col items-center gap-1 rounded-2xl bg-surface px-2.5 py-2 shadow-lift ring-1 ring-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={t("helpBot")}
          >
            <img
              src="/logo-transparent.svg?v=17"
              alt=""
              width={44}
              height={44}
              className="size-11 object-contain"
              style={{ width: 44, height: 44, maxWidth: 44, maxHeight: 44, objectFit: "contain" }}
            />
            <span className="max-w-[4.75rem] whitespace-normal text-center text-[11px] font-semibold leading-tight text-primary">
              {t("helpBot")}
            </span>
          </button>
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-fg/40" />
        {/* The shared dialog rule overrides utility z-index values. */}
        <Dialog.Content
          aria-modal="true"
          aria-describedby={undefined}
          data-ke="help-dialog"
          style={{ zIndex: 110 }}
          className="fixed left-1/2 top-1/2 z-[110] flex max-h-[calc(100dvh-2rem)] w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-2xl bg-surface shadow-lift ring-1 ring-border outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-fg">
            <div className="min-w-0">
              <Dialog.Title className="break-words text-sm font-semibold">
                {t("helpBot")}
              </Dialog.Title>
              <p className="text-xs leading-4 text-primary-fg/80">{t("helpBotLead")}</p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                aria-label={t("close")}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          {open ? (
            <Suspense
              fallback={
                <p className="p-4 text-sm" role="status">
                  {t("loading")}
                </p>
              }
            >
              <HelpBotPanel />
            </Suspense>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
