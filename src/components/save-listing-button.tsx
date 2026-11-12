import { markMeaningfulAction } from "@/lib/prompt-manager";
import { Heart } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { confirmAction } from "@/lib/success-confirm";
import { parentSignupSearch } from "@/lib/auth/parent-login";
import { guestSaveHref, saveLoginTo, saveReturnPath } from "@/lib/qa-fixes";
import { addGuestShortlist } from "@/lib/guest-shortlist";
import { capturePostHogEvent } from "@/lib/posthog";
import { SIGNUP_FUNNEL_EVENT, signupFunnelPayload, signupPromptStep } from "@/lib/signup-funnel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listSavedIds, saveDaycare, unsaveDaycare } from "@/lib/server/family";
import {
  loadShortlistIds,
  markShortlistCache,
  readShortlistCache,
  SHORTLIST_EVENT,
  stashPendingSave,
} from "@/lib/shortlist";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { captureRankingEvent } from "@/lib/ranking/events";
import { rankingContextFor } from "@/lib/ranking/context";

const HEART_SAVED = "var(--color-danger)";

export type SaveListingAppearance = "photo" | "ghost" | "bar";

async function hydrateShortlistCache(userId: string) {
  const ids = await loadShortlistIds(userId, listSavedIds);
  return new Set(ids);
}

export function SaveListingButton({
  daycareId,
  nextPath,
  appearance = "photo",
  framed = true,
  className,
}: {
  daycareId: string;
  nextPath?: string;
  appearance?: SaveListingAppearance;
  /** Full chip on listing photos; the hero uses a quieter surface backing. */
  framed?: boolean;
  className?: string;
}) {
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const fallbackPath = useRouterState({ select: (s) => s.location.pathname });
  const fallbackSearch = useRouterState({ select: (s) => s.location.searchStr });
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
        if (!live) return;
        const cache = readShortlistCache(user.id);
        if (cache) setSaved(cache.has(daycareId));
      });
    return () => {
      live = false;
    };
  }, [user, isPending, daycareId]);

  function goLogin() {
    stashPendingSave(daycareId);
    addGuestShortlist({ id: daycareId });
    capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload(signupPromptStep("save"), { source: "listing" }));
    toast.message(t("signupWhySave"));
    void navigate({
      to: saveLoginTo(locale === "fr" ? "fr" : "en"),
      search: parentSignupSearch(saveReturnPath(fallbackPath, fallbackSearch, nextPath), "save"),
    });
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
      if (nowSaved) {
        markMeaningfulAction("save");
        const ctx = rankingContextFor(daycareId);
        captureRankingEvent("listing_saved", {
          listing_id: daycareId,
          position: ctx.position,
          sort: ctx.sort,
          variant: ctx.variant,
        });
      }
      confirmAction(t, nowSaved ? "listingSaved" : "listingRemoved");
    } catch {
      setSaved(!next);
      markShortlistCache(daycareId, !next, user.id);
      if (!user) goLogin();
      else toast.error(t("needSignInSave"));
    } finally {
      setBusy(false);
    }
  }

  const label = saved ? t("unsave") : t("save");
  const guestHref = guestSaveHref(fallbackPath, fallbackSearch, locale === "fr" ? "fr" : "en");

  if (!user) {
    return (
      <a
        href={guestHref}
        aria-label={label}
        data-ke="save-listing"
        onClick={(e) => {
          e.preventDefault();
          goLogin();
        }}
        className={cn(
          appearance === "photo"
            ? cn(
                "pointer-events-auto absolute right-2 top-2 z-20 grid min-h-[44px] min-w-[44px] place-items-center rounded-full text-fg ring-1 ring-border",
                framed ? "size-12 bg-surface" : "size-11 bg-surface/90",
              )
            : "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-fg",
          className,
        )}
      >
        <Heart className={appearance === "photo" ? "size-7 text-fg" : "size-4 text-fg"} aria-hidden />
      </a>
    );
  }

  if (appearance === "ghost") {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={(e) => void onSave(e)}
        aria-label={label}
        aria-pressed={saved}
        className={className}
        disabled={busy}
      >
        <Heart className={cn("size-4", saved && "fill-current text-danger")} aria-hidden />
      </Button>
    );
  }

  if (appearance === "bar") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={(e) => void onSave(e)}
        aria-label={label}
        aria-pressed={saved}
        className={className}
        disabled={busy}
      >
        <Heart className={cn("size-5", saved && "fill-current text-danger")} aria-hidden />
      </Button>
    );
  }

  return (
    <button
      type="button"
      data-ke="save-listing"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => void onSave(e)}
      className={cn(
        "pointer-events-auto absolute right-2 top-2 z-20 grid min-h-[44px] min-w-[44px] place-items-center rounded-full ring-1 ring-border",
        framed
          ? "size-12 bg-surface"
          : "size-11 bg-surface/90",
        className,
      )}
      aria-label={label}
      aria-pressed={saved}
      disabled={busy}
    >
      {framed ? (
        <Heart
          className={cn("size-7", saved ? "text-danger" : "text-fg")}
          strokeWidth={saved ? 2 : 2.25}
          fill={saved ? HEART_SAVED : "none"}
          aria-hidden
        />
      ) : (
        <Heart
          className={cn("size-[22px]", saved ? "text-danger" : "text-fg")}
          strokeWidth={1.7}
          fill={saved ? HEART_SAVED : "none"}
          aria-hidden
        />
      )}
    </button>
  );
}
