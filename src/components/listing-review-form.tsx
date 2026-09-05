import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyListingReview, submitListingReview } from "@/lib/server/reviews";
import { useCopy } from "@/lib/use-copy";
import type { Review } from "@/lib/types";

export function ListingReviewForm({ daycareId, slug }: { daycareId: string; slug: string }) {
  const { t, locale } = useCopy();
  const { user, isPending } = useCurrentUserState();
  const { token, onToken } = useTurnstileToken();
  const [mine, setMine] = useState<Review | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPending || !user) {
      setMine(null);
      return;
    }
    void getMyListingReview({ data: daycareId })
      .then(setMine)
      .catch(() => setMine(null));
  }, [daycareId, user, isPending]);

  if (!user && !isPending) {
    return (
      <p className="mt-4 text-sm text-muted">
        {t("reviewNeedSignIn")}{" "}
        <Link to="/login" search={{ next: `/daycare/${slug}`, role: "parent", intent: "in" }} className="text-primary underline-offset-4 hover:underline">
          {t("signIn")}
        </Link>
      </p>
    );
  }

  if (mine?.status === "pending") {
    return <p className="mt-4 rounded-lg bg-surface p-3 text-sm text-muted ring-1 ring-border">{t("reviewPending")}</p>;
  }
  if (mine?.status === "approved") {
    return <p className="mt-4 text-sm text-muted">{t("reviewApproved")}</p>;
  }
  if (mine?.status === "rejected") {
    return <p className="mt-4 text-sm text-muted">{t("reviewRejected")}</p>;
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
          data: { daycareId, rating, body, locale, turnstileToken: token },
        })
          .then(() => {
            toast.success(t("reviewSent"));
            setMine({
              id: "pending",
              daycareId,
              author: user?.displayName || "Parent",
              rating,
              body,
              bodyFr: locale === "fr" ? body : "",
              createdAt: new Date().toISOString(),
              status: "pending",
            });
            setBody("");
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : t("writeReview")))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-medium">{t("writeReview")}</p>
      <p className="text-sm text-muted">{t("writeReviewLead")}</p>
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
      <label className="block text-sm">
        {t("reviewBody")}
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-border bg-bg px-3 py-2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={12}
          maxLength={2000}
        />
      </label>
      <TurnstileField onToken={onToken} />
      <Button type="submit" size="sm" disabled={busy || isPending}>
        {t("submit")}
      </Button>
    </form>
  );
}
