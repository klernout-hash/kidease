import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { confirmAction } from "@/lib/success-confirm";
import { Button } from "@/components/ui/button";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getListingReviewAccess, submitListingReview } from "@/lib/server/reviews";
import { isPublicReviewStatus, normalizeReviewStatus } from "@/lib/review-gate";
import { localePath } from "@/lib/locale-path";
import { REVIEW_DIMENSIONS, type ReviewDimensionId } from "@/lib/review-dimensions";
import { useCopy } from "@/lib/use-copy";
import type { Review } from "@/lib/types";

type Access = {
  canWrite: boolean;
  reason: string;
  mine: Review | null;
};

export function ListingReviewForm({ daycareId, slug }: { daycareId: string; slug: string }) {
  const { t, locale } = useCopy();
  const { user, isPending } = useCurrentUserState();
  const { token, onToken } = useTurnstileToken();
  const [access, setAccess] = useState<Access | null>(null);
  const [rating, setRating] = useState(0);
  const [touched, setTouched] = useState<Partial<Record<ReviewDimensionId, number>>>({});
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const fr = locale === "fr";
  const dimensions = Object.fromEntries(
    REVIEW_DIMENSIONS.map((dim) => [dim.id, touched[dim.id] ?? (rating >= 1 ? rating : 0)]),
  ) as Record<ReviewDimensionId, number>;

  useEffect(() => {
    if (isPending || !user) {
      setAccess(null);
      return;
    }
    void getListingReviewAccess({ data: daycareId })
      .then(setAccess)
      .catch(() => setAccess({ canWrite: false, reason: "none", mine: null }));
  }, [daycareId, user, isPending]);

  if (isPending || (user && access === null)) {
    return null;
  }

  if (!user) {
    return (
      <p className="mt-4 text-sm text-muted">
        {t("reviewNeedSignIn")}{" "}
        <Link to={localePath("/login", locale)} search={{ next: localePath(`/daycare/${slug}`, locale), role: "parent", desk: "parent", intent: "in" }} className="text-primary underline-offset-4 hover:underline">
          {t("signIn")}
        </Link>
      </p>
    );
  }

  const mine = access?.mine ?? null;
  const status = mine ? normalizeReviewStatus(mine.status) : null;
  if (status === "pending") {
    return <p className="mt-4 rounded-lg bg-surface p-3 text-sm text-muted ring-1 ring-border">{t("reviewPending")}</p>;
  }
  if (mine && isPublicReviewStatus(mine.status)) {
    return <p className="mt-4 text-sm text-muted">{t("reviewApproved")}</p>;
  }
  if (status === "hidden") {
    return <p className="mt-4 text-sm text-muted">{t("reviewRejected")}</p>;
  }
  if (access && !access.canWrite) {
    return (
      <p className="mt-4 rounded-lg bg-surface p-3 text-sm text-muted ring-1 ring-border">
        {access.reason === "centre_owner" ? t("reviewCentreBlocked") : t("reviewNeedRelationship")}
      </p>
    );
  }

  return (
    <form
      className="mt-4 space-y-3 rounded-lg bg-surface p-4 ring-1 ring-border"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating < 1) {
          toast.error(t("reviewRating"));
          return;
        }
        setBusy(true);
        void submitListingReview({
          data: { daycareId, rating, body, locale, turnstileToken: token, dimensions },
        })
          .then(() => {
            confirmAction(t, "reviewSubmitted");
            setAccess({
              canWrite: true,
              reason: access?.reason ?? "enrolment",
              mine: {
                id: "pending",
                daycareId,
                author: user?.displayName || "Parent",
                rating,
                body,
                bodyFr: locale === "fr" ? body : "",
                createdAt: new Date().toISOString(),
                status: "pending",
              },
            });
            setBody("");
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : t("writeReview")))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-medium">{access?.reason === "enrolment" ? t("verifiedReviewPrompt") : t("writeReview")}</p>
      <p className="text-sm text-muted">{access?.reason === "enrolment" ? t("verifiedReviewLead") : t("writeReviewLead")}</p>
      <fieldset>
        <legend className="text-sm">{t("reviewRating")}</legend>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={n <= rating ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-fg" : "rounded-md bg-bg px-3 py-1.5 text-sm ring-1 ring-border"}
              aria-pressed={n <= rating}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset data-ke="review-dimensions-form">
        <legend className="text-sm">{fr ? "Cinq points" : "Five scores"}</legend>
        <p className="mt-1 text-sm text-muted">
          {fr
            ? "Chaque point suit la note globale jusqu'à ce que vous le changiez."
            : "Each score follows the overall stars until you change it."}
        </p>
        <ul className="mt-3 space-y-3">
          {REVIEW_DIMENSIONS.map((dim) => (
            <li key={dim.id}>
              <span className="text-sm">{fr ? dim.fr : dim.en}</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={
                      n <= (dimensions[dim.id] || 0)
                        ? "min-h-11 min-w-11 rounded-full bg-primary text-sm text-primary-fg touch-manipulation"
                        : "min-h-11 min-w-11 rounded-full bg-bg text-sm ring-1 ring-border touch-manipulation"
                    }
                    aria-pressed={dimensions[dim.id] === n}
                    onClick={() => setTouched((prev) => ({ ...prev, [dim.id]: n }))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="block text-sm">
        {t("reviewBody")}
        <textarea
          className="ke-textarea mt-1 min-h-24"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={12}
          maxLength={2000}
        />
      </label>
      <TurnstileField onToken={onToken} />
      <Button type="submit" size="sm" disabled={busy || isPending || !access?.canWrite}>
        {t("submit")}
      </Button>
    </form>
  );
}
