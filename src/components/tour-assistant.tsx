import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AI_FLAGS } from "@/lib/ai/flags";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { answerTourAssistant, type TourAssistantFacts, type TourAssistantSlot } from "@/lib/ai/tour-assistant";
import { createTourRequest } from "@/lib/server/tours";
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
    const slot = facts.slots.find((row) => row.id === slotId);
    if (!slot) return;
    setBusy(true);
    try {
      await createTourRequest({
        data: {
          daycareId,
          preferredTimes: [{ date: slot.date, time: slot.time }],
          locale: loc,
        },
      });
      setReply(loc === "fr" ? "La demande est envoyée. Le centre la verra dans Demandes." : "The request is sent. The centre will see it under Requests.");
      setSlotId(null);
    } catch {
      setReply(loc === "fr" ? "Connectez-vous avec un compte parent pour envoyer cette visite." : "Sign in with a parent account to send this tour.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 space-y-2 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="tour-assistant">
      <h3 className="font-display text-lg">{t("tourAssistantTitle")}</h3>
      <label className="block text-sm">
        {t("tourAssistantPrompt")}
        <textarea
          className="ke-textarea mt-1 w-full"
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
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

export function tourAssistantFactsFromListing(input: {
  centre: string;
  hours?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  slots: readonly TourAssistantSlot[];
}): TourAssistantFacts {
  const fees = [
    input.infantMonthly != null ? `infant ${input.infantMonthly}` : "",
    input.toddlerMonthly != null ? `toddler ${input.toddlerMonthly}` : "",
    input.preschoolMonthly != null ? `preschool ${input.preschoolMonthly}` : "",
  ].filter(Boolean);
  const ages =
    input.ageMinMonths != null && input.ageMaxMonths != null && (input.ageMinMonths > 0 || input.ageMaxMonths > 0)
      ? `${input.ageMinMonths}-${input.ageMaxMonths} months`
      : null;
  return {
    centre: input.centre,
    hours: (input.hours || "").trim() || null,
    ages,
    fees: fees.length ? fees.join(", ") : null,
    openings: null,
    slots: input.slots,
  };
}
