import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuccessConfirm } from "@/components/use-success-confirm";
import { Button } from "@/components/ui/button";
import { featureCopy } from "@/lib/flagged-feature-copy";
import { POST_AGES } from "@/lib/gap-features";
import { localePath } from "@/lib/locale-path";
import { ageOpenSpotsFlag, postAgeOpenSpots } from "@/lib/server/open-spot-posts";
import { sendCentreSpotOffer } from "@/lib/server/spot-offers";
import { useCopy } from "@/lib/use-copy";

export function AgeOpenSpotsDesk({ listings }: { listings: { id: string; name: string }[] }) {
  const { locale } = useCopy();
  const { celebrate } = useSuccessConfirm();
  const copy = featureCopy(locale);
  const [on, setOn] = useState(false);
  const [daycareId, setDaycareId] = useState(listings[0]?.id || "");
  const [ageGroup, setAgeGroup] = useState<(typeof POST_AGES)[number]>("preschool");
  const [spots, setSpots] = useState("1");
  const [message, setMessage] = useState("");
  const [nextId, setNextId] = useState<string | null>(null);

  useEffect(() => {
    void ageOpenSpotsFlag().then(setOn).catch(() => setOn(false));
  }, []);
  useEffect(() => {
    if (!daycareId && listings[0]) setDaycareId(listings[0].id);
  }, [daycareId, listings]);
  if (!on || !listings.length) return null;

  const ageLabel = { infant: copy.infant, toddler: copy.toddler, preschool: copy.preschool };

  return (
    <section className="mb-8 w-full max-w-3xl" data-ke="age-open-spots">
      <h2 className="font-display text-2xl">{copy.spotsTitle}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{copy.spotsLead}</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void postAgeOpenSpots({ data: { daycareId, ageGroup, spots: Number(spots) } })
            .then((result) => {
              if (!result.ok) {
                setMessage(copy.spotsOff);
                return;
              }
              setMessage(copy.spotsPosted);
              setNextId(result.nextWaitlistId);
              celebrate();
            })
            .catch(() => setMessage(copy.spotsOff));
        }}
      >
        <label className="block text-sm">
          {copy.centre}
          <select className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border" value={daycareId} onChange={(event) => setDaycareId(event.target.value)}>
            {listings.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {copy.spotsAge}
          <select className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as (typeof POST_AGES)[number])}>
            {POST_AGES.map((age) => (
              <option key={age} value={age}>
                {ageLabel[age]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {copy.spotsCount}
          <input
            className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
            inputMode="numeric"
            value={spots}
            onChange={(event) => setSpots(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
          />
        </label>
        <Button type="submit">{copy.spotsPost}</Button>
      </form>
      {nextId ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            void sendCentreSpotOffer({ data: { waitlistId: nextId } })
              .then(() => {
                setMessage(copy.spotsOffer);
                celebrate();
              })
              .catch(() => setMessage(copy.spotsOff));
          }}
        >
          {copy.spotsOffer}
        </Button>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <Link to={localePath("/help", locale)} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {copy.help}
      </Link>
    </section>
  );
}
