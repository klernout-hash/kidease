import { useEffect, useState } from "react";
import { useCopy } from "@/lib/use-copy";

const STORAGE_KEY = "kidease-explore-hint";

export function ExploreHint() {
  const { t } = useCopy();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="mt-4 rounded-xl bg-primary/8 p-4 ring-1 ring-primary/15">
      <p className="text-sm font-semibold text-fg">{t("exploreHintTitle")}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{t("exploreHintBody")}</p>
      <button
        type="button"
        className="mt-3 min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => {
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
          setShow(false);
        }}
      >
        {t("exploreHintDismiss")}
      </button>
    </div>
  );
}
