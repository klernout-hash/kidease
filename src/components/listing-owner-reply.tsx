import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { replyToListingReview } from "@/lib/server/reviews";
import { useCopy } from "@/lib/use-copy";

/** Shows a centre reply. Owners can write one. Parents never see the review body in a push. */
export function ListingOwnerReply({
  reviewId,
  ownsListing,
  reply,
}: {
  reviewId: string;
  ownsListing: boolean;
  reply: string | null;
}) {
  const { t } = useCopy();
  const [text, setText] = useState(reply || "");
  const [shown, setShown] = useState(reply || "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-2">
      {shown ? (
        <p className="text-sm text-fg">
          <span className="font-medium">{t("reviewFromCentre")}: </span>
          {shown}
        </p>
      ) : null}
      {ownsListing ? (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            const body = text.trim();
            if (body.length < 2) return;
            setBusy(true);
            void replyToListingReview({ data: { reviewId, body } })
              .then(() => {
                setShown(body);
                toast(t("reviewReplySaved"));
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : t("reviewReplySave")))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm" htmlFor={`reply-${reviewId}`}>
            {t("reviewReplyLabel")}
            <textarea
              id={`reply-${reviewId}`}
              className="mt-1 min-h-24 w-full rounded-md border border-border bg-bg px-3 py-2 text-base"
              maxLength={800}
              value={text}
              placeholder={t("reviewReplyPlaceholder")}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary" className="mt-2 min-h-11" disabled={busy || text.trim().length < 2}>
            {t("reviewReplySave")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
