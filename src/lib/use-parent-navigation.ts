import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { parentDeskTabOrDefault, type ParentDeskTab } from "./parent-tab";
import { yieldToMain } from "./yield-main";

/** The URL, highlighted tab and deferred panel must all follow the latest choice. */
export function useParentNavigation(
  initialTab: ParentDeskTab | undefined,
  navigate: (id: string) => void,
) {
  const initial = initialTab ?? "explore";
  const [tab, setTab] = useState<ParentDeskTab>(initial);
  const [contentTab, setContentTab] = useState<ParentDeskTab>(initial);
  const target = useRef<string>(initial);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!initialTab) return;
    generation.current += 1;
    target.current = initialTab;
    setTab(initialTab);
    startTransition(() => setContentTab(initialTab));
  }, [initialTab]);
  const selectTab = useCallback(
    (id: string) => {
      const next = parentDeskTabOrDefault(id);
      if (!mounted.current || target.current === id) return;
      target.current = id;
      const current = ++generation.current;
      setTab(next);
      // A return to the current URL must also cancel a pending navigation away.
      navigate(id);
      void yieldToMain().then(() => {
        if (mounted.current && current === generation.current) {
          startTransition(() => setContentTab(next));
        }
      });
    },
    [navigate],
  );
  return { tab, contentTab, selectTab };
}
