import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { privateFeedCopy } from "@/lib/private-photo-feed";
import { grantPhotoConsent, photoFeedGate } from "@/lib/server/daily-care";
import { useCopy } from "@/lib/use-copy";

export function PhotoConsentCard() {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const copy = privateFeedCopy(lang);
  const [enabled, setEnabled] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void photoFeedGate()
      .then((gate) => {
        setEnabled(Boolean(gate.enabled));
        setBookingId(gate.bookingId);
      })
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  return (
    <section className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="photo-consent">
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="mt-2 text-sm text-muted">{copy.body}</p>
      {bookingId ? (
        <Button
          className="mt-3"
          type="button"
          onClick={() => {
            void grantPhotoConsent({ data: { bookingId } })
              .then(() => setMessage(copy.saved))
              .catch(() => setMessage(copy.body));
          }}
        >
          {copy.consent}
        </Button>
      ) : (
        <p className="mt-3 text-sm text-muted">{copy.body}</p>
      )}
      {message ? (
        <p className="mt-2 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <Link
        to={localePath("/help", locale)}
        className="mt-2 inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {copy.help}
      </Link>
    </section>
  );
}
