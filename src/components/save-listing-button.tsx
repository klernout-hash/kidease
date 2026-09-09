import { Heart } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listSavedIds, saveDaycare, unsaveDaycare } from "@/lib/server/family";
import {
  markShortlistCache,
  readShortlistCache,
  SHORTLIST_EVENT,
  stashPendingSave,
  writeShortlistCache,
} from "@/lib/shortlist";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const HEART_SAVED = "#FF385C";

export type SaveListingAppearance = "photo" | "ghost" | "bar";

async function hydrateShortlistCache(userId: string) {
  const cached = readShortlistCache(userId);
  if (cached) return cached;
  const ids = await listSavedIds();
  writeShortlistCache(ids, userId);
  return new Set(ids);
}

export function SaveListingButton({
  daycareId,
  nextPath,
  appearance = "photo",
  className,
}: {
  daycareId: string;
  nextPath?: string;
  appearance?: SaveListingAppearance;
  className?: string;
}) {
  const { t } = useCopy();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const fallbackPath = useRouterState({ select: (s) => s.location.pathname });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function sync() {
      const cache = readShortlistCache(user?.id);
      if (cache) setSaved(cache.has(daycareId));
    }
    sync();
    window.addEventListener(SHORTLIST_EVENT, sync);
    return () => window.removeEventListener(SHORTLIST_EVENT, sync);
  }, [daycareId, user?.id]);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setSaved(false);
      return;
    }
    let live = true;
    void hydrateShortlistCache(user.id)
      .then((ids) => {
        if (live) setSaved(ids.has(daycareId));
      })
      .catch(() => {
        if (live) setSaved(false);
      });
    return () => {
      live = false;
    };
  }, [user, isPending, daycareId]);

  function goLogin() {
    stashPendingSave(daycareId);
    toast.message(t("needSignInSave"));
    void navigate({ to: "/login", search: parentLoginSearch(nextPath || fallbackPath) });
  }

  async function onSave(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!user) {
      goLogin();
      return;
    }
    setBusy(true);
    const next = !saved;
    setSaved(next);
    markShortlistCache(daycareId, next, user.id);
    try {
      const res = next ? await saveDaycare({ data: daycareId }) : await unsaveDaycare({ data: daycareId });
      const nowSaved = res.saved;
      setSaved(nowSaved);
      markShortlistCache(daycareId, nowSaved, user.id);
      toast.success(nowSaved ? t("savedToShortlist") : t("removedFromShortlist"));
    } catch {
      setSaved(!next);
      markShortlistCache(daycareId, !next);
      if (!user) goLogin();
      else toast.error(t("needSignInSave"));
    } finally {
      setBusy(false);
    }
  }

  const label = saved ? t("unsave") : t("save");

  if (appearance === "ghost") {
    return (
      <Button
        variant="ghost"
        onClick={(e) => void onSave(e)}
        aria-label={label}
        aria-pressed={saved}
        className={className}
        disabled={busy}
      >
        <Heart className={saved ? "size-4 fill-fg" : "size-4"} />
      </Button>
    );
  }

  if (appearance === "bar") {
    return (
      <Button
        variant="secondary"
        size="icon"
        onClick={(e) => void onSave(e)}
        aria-label={label}
        aria-pressed={saved}
        className={className}
        disabled={busy}
      >
        <Heart className={cn("size-5", saved && "fill-fg")} />
      </Button>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => void onSave(e)}
      className={cn("pointer-events-auto absolute right-2 top-2 z-20 grid size-11 place-items-center rounded-full", className)}
      aria-label={label}
      aria-pressed={saved}
      disabled={busy}
    >
      <Heart
        className={cn("size-[22px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]", saved ? "text-[#FF385C]" : "text-white")}
        strokeWidth={1.7}
        fill={saved ? HEART_SAVED : "rgba(0,0,0,0.28)"}
      />
    </button>
  );
}
