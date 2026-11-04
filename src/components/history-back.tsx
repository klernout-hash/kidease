import { useEffect, useState, type AnchorHTMLAttributes } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import {
  hrefFor,
  labelKeyForLocation,
  readHistoryIndex,
  recordScreen,
  resolveHistoryBack,
  type HistoryBackDecision,
} from "@/lib/screen-history";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Records each screen under the router history index. Mount once at the root. */
export function ScreenHistoryRecorder() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search });
  const searchKey = hrefFor(pathname, search);
  useEffect(() => {
    const index = readHistoryIndex(window.history.state);
    recordScreen(index, { href: searchKey, labelKey: labelKeyForLocation(pathname, search) });
  }, [pathname, search, searchKey]);
  return null;
}

/**
 * Chevron plus the previous screen's name.
 * History wins. A cold open replaces to the parent route so a section
 * link cannot push a second Profile on top of Wallet.
 */
export function HistoryBack({
  fallbackHref,
  fallbackLabel,
  fallbackAria,
  marker = "history-back",
  className,
  onFallback,
  ...rest
}: {
  fallbackHref: string;
  fallbackLabel: string;
  fallbackAria?: string;
  marker?: string;
  className?: string;
  onFallback?: () => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick" | "className">) {
  const { t } = useCopy();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search });
  const currentHref = hrefFor(pathname, search);
  const [decision, setDecision] = useState<HistoryBackDecision>(() => ({
    via: "fallback",
    href: fallbackHref,
    labelKey: "back",
  }));

  useEffect(() => {
    const index = readHistoryIndex(window.history.state);
    setDecision(
      resolveHistoryBack({
        index,
        currentHref,
        fallbackHref,
        fallbackLabelKey: "back",
      }),
    );
  }, [currentHref, fallbackHref]);

  const label = decision.via === "history" ? t(decision.labelKey) : fallbackLabel;
  const aria = decision.via === "history" ? label : (fallbackAria ?? fallbackLabel);

  return (
    <a
      {...rest}
      href={decision.via === "history" ? decision.href : fallbackHref}
      data-ke={marker}
      data-back-via={decision.via}
      data-back-label={label}
      aria-label={aria}
      title={aria}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const index = readHistoryIndex(window.history.state);
        const next = resolveHistoryBack({
          index,
          currentHref: hrefFor(pathname, search),
          fallbackHref,
          fallbackLabelKey: "back",
        });
        if (next.via === "history" && router.history.canGoBack()) {
          router.history.back();
          return;
        }
        if (onFallback) {
          onFallback();
          return;
        }
        router.history.replace(fallbackHref);
      }}
      className={cn(
        "inline-flex min-h-11 max-w-[12rem] items-center gap-0.5 rounded-full pr-2 text-sm font-semibold text-primary touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <ChevronLeft className="size-6 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </a>
  );
}
