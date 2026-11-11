import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PHASE1_CARD_COPY, phase1CardsFor, type Phase1Card } from "@/lib/phase1-screens";
import { phase1ScreenFlags } from "@/lib/server/phase1-screen-flags";

/**
 * Phase 1 desks a person can open. Hidden until a flag for that card is on.
 * The button does not send mail, text, or a charge.
 */
export function Phase1Desk({ locale, role }: { locale: "en" | "fr"; role: string | null }) {
  const [flags, setFlags] = useState<Partial<Record<Phase1Card, boolean>>>({});
  const fr = locale === "fr";
  useEffect(() => {
    let live = true;
    void phase1ScreenFlags()
      .then((next) => {
        if (live) setFlags(next);
      })
      .catch(() => {
        if (live) setFlags({});
      });
    return () => {
      live = false;
    };
  }, []);
  const cards = phase1CardsFor(role).filter((card) => flags[card]);
  if (!cards.length) return null;
  return (
    <div className="mt-6 space-y-4" data-ke="phase1-desk">
      {cards.map((card) => {
        const copy = PHASE1_CARD_COPY[card];
        return (
          <section key={card} className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke={`phase1-${card}`}>
            <h2 className="font-display text-xl">{fr ? copy.fr : copy.en}</h2>
            <p className="mt-1 text-sm text-muted">{fr ? copy.detailFr : copy.detailEn}</p>
            <Button type="button" className="mt-3" disabled>
              {fr ? "Rien n'est envoyé" : "Nothing is sent"}
            </Button>
          </section>
        );
      })}
    </div>
  );
}
