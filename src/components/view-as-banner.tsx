import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { exitViewAs, getViewAsState } from "@/lib/server/view-as-api";
import { fillViewAs, viewAsMinutesLeft, viewAsWho } from "@/lib/view-as";
import type { ViewAsPublic } from "@/lib/view-as-public";
import { useCopy } from "@/lib/use-copy";
import { openAdminDesk } from "@/lib/desks";

const ViewAsContext = createContext<ViewAsPublic | null>(null);

export function useViewAs(): ViewAsPublic | null {
  return useContext(ViewAsContext);
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewAsPublic | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getViewAsState()
      .then((state) => {
        if (cancelled) return;
        setView(state.active ? state : null);
      })
      .catch(() => {
        if (!cancelled) setView(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ViewAsContext.Provider value={view}>
      {view ? <ViewAsBanner view={view} /> : null}
      {children}
    </ViewAsContext.Provider>
  );
}

function ViewAsBanner({ view }: { view: ViewAsPublic }) {
  const { t } = useCopy();
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const who = viewAsWho(view.name, view.email, t("viewAsUnknown"));
  const minutes = viewAsMinutesLeft(Date.parse(view.expiresAt), Date.now());

  useLayoutEffect(() => {
    const node = barRef.current;
    if (!node) return;
    const measure = () => {
      const next = node.offsetHeight;
      setHeight(next);
      document.documentElement.style.setProperty("--ke-view-as-h", `${next}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--ke-view-as-h");
    };
  }, [who, minutes, error]);

  async function onExit() {
    setBusy(true);
    setError("");
    try {
      await exitViewAs();
      openAdminDesk();
    } catch {
      setError(t("viewAsExitFailed"));
      setBusy(false);
    }
  }

  return (
    <>
      <div
        ref={barRef}
        data-ke="view-as-banner"
        role="status"
        className="fixed inset-x-0 top-0 z-[80] border-b border-amber-900/20 bg-amber-100 px-4 pb-3 text-amber-950 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{fillViewAs(t("viewAsBanner"), { who })}</p>
            <p className="mt-1 text-sm text-amber-950">
              {t("viewAsReadOnly")} {fillViewAs(t("viewAsMinutes"), { n: minutes })}
            </p>
            {error ? (
              <p className="mt-1 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="primary"
            className="min-h-11 min-w-11"
            disabled={busy}
            onClick={() => void onExit()}
          >
            {t("viewAsExit")}
          </Button>
        </div>
      </div>
      <div aria-hidden="true" className={height ? undefined : "min-h-32"} style={{ height: height || undefined }} />
    </>
  );
}

/** Replaces a write form while a view-as session is open. */
export function ViewAsWriteLock({ children }: { children: ReactNode }) {
  const view = useViewAs();
  const { t } = useCopy();
  if (!view) return children;
  return (
    <p className="text-sm text-muted" role="status" data-ke="view-as-lock">
      {t("viewAsReadOnly")}
    </p>
  );
}
