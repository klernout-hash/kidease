import { lazy, Suspense, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { helpLauncherVisible } from "@/lib/help-launcher";
import { useCopy } from "@/lib/use-copy";

const HelpBotPanel = lazy(() => import("@/components/help-bot").then((m) => ({ default: m.HelpBotPanel })));

/** The help button is in the first HTML. The chat panel loads when someone opens it. */
export function LiveChatSlot() {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  if (!helpLauncherVisible(pathname)) return null;
  return (
    <div className="ke-help-bot" data-ke="help-launcher">
      {open ? (
        <Suspense fallback={null}>
          <HelpBotPanel onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 min-w-11 touch-manipulation select-none flex-col items-center gap-1 rounded-2xl bg-surface px-2.5 py-2 shadow-lift ring-1 ring-border"
        aria-label={t("helpBot")}
        aria-expanded={open}
      >
        {open ? (
          <X className="size-7 text-primary" />
        ) : (
          <img
            src="/logo-transparent.svg?v=17"
            alt=""
            width={44}
            height={44}
            className="size-11 object-contain"
            style={{ width: 44, height: 44, maxWidth: 44, maxHeight: 44, objectFit: "contain" }}
          />
        )}
        <span className="max-w-[4.75rem] whitespace-normal text-center text-[11px] font-semibold leading-tight text-primary">{t("helpBot")}</span>
      </button>
    </div>
  );
}
