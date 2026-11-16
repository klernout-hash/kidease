import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AI_FLAGS } from "@/lib/ai/flags";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { answerTourAssistant, type TourAssistantFacts } from "@/lib/ai/tour-assistant";
import { createTourRequest } from "@/lib/server/tours";
import { listPublicTourSlots } from "@/lib/server/tour-calendar";
import { useCopy } from "@/lib/use-copy";

export function TourAssistant({
  daycareId,
  facts,
}: {
  daycareId: string;
  facts: TourAssistantFacts;
}) {
  const on = useAiFeatureFlag(AI_FLAGS.tourAssistant);
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [slotId, setSlotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!on) return null;

  function ask() {
    const next = answerTourAssistant({ facts, question, locale: loc });
    setReply(next.text);
    setSlotId(next.kind === "book" ? next.slotId : null);
  }

  async function confirm() {
    const slot = facts.slots.find((row) => row.id === slotId && row.remaining > 0);
    if (!slot) return;
    setBusy(true);
    try {
      const fresh = await listPublicTourSlots({ data: { daycareId } });
      const stillOpen = fresh.slots.some(
        (row) => row.id === slot.id && row.remaining > 0 && row.date === slot.date && row.startTime === slot.time,
      );
      if (!stillOpen) {
        setReply(t("tourAssistantSlotGone"));
        setSlotId(null);
        return;
      }
      await createTourRequest({
        data: {
          daycareId,
          preferredTimes: [{ date: slot.date, time: slot.time }],
          locale: loc,
        },
      });
      setReply(t("tourAssistantSent"));
      setSlotId(null);
    } catch {
      setReply(t("tourAssistantSignIn"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 space-y-2 rounded-xl border border-border bg-surface p-4" data-ke="tour-assistant">
      <h3 className="font-display text-lg">{t("tourAssistantTitle")}</h3>
      <label className="block text-sm" htmlFor="tour-assistant-question">
        {t("tourAssistantPrompt")}
        <textarea
          id="tour-assistant-question"
          className="ke-textarea mt-1 w-full"
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
        />
      </label>
      <Button type="button" variant="secondary" className="min-h-11 touch-manipulation" onClick={ask}>
        {t("tourAssistantSend")}
      </Button>
      {reply ? <p className="text-sm">{reply}</p> : null}
      {slotId ? (
        <Button type="button" className="min-h-11 touch-manipulation" disabled={busy} onClick={() => void confirm()}>
          {t("tourAssistantConfirm")}
        </Button>
      ) : null}
    </section>
  );
}

