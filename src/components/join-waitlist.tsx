import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { spotOfferCopy } from "@/lib/spot-offer-copy";
import { joinDaycareWaitlist, listMySpotOffers, withdrawDaycareWaitlist } from "@/lib/server/spot-offers";
import { useCopy } from "@/lib/use-copy";

export function JoinWaitlist({ daycareId, next }: { daycareId: string; next: string }) {
  const { locale } = useCopy();
  const copy = spotOfferCopy(locale);
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [ageGroup, setAgeGroup] = useState("infant");
  const [childLabel, setChildLabel] = useState("");
  const [note, setNote] = useState("");
  const [mineId, setMineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !user) {
      setMineId(null);
      return;
    }
    let live = true;
    void listMySpotOffers()
      .then((result) => {
        if (!live) return;
        const row = result.rows.find(
          (item) => item.daycareId === daycareId && (item.status === "waiting" || item.status === "offered"),
        );
        setMineId(row?.id ?? null);
      })
      .catch(() => {
        if (live) setMineId(null);
      });
    return () => {
      live = false;
    };
  }, [daycareId, user, isPending]);

  function focusIn(event: { currentTarget: HTMLElement }) {
    event.currentTarget.scrollIntoView({ block: "center" });
  }

  function onJoin() {
    if (!user) {
      void navigate({ to: "/login", search: parentLoginSearch(next) });
      return;
    }
    setBusy(true);
    setError(null);
    void joinDaycareWaitlist({ data: { daycareId, ageGroup, childLabel, note } })
      .then((row) => {
        setMineId(row.id);
        toast.success(copy.joined);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : copy.feeBlocked;
        setError(message);
        toast.error(message);
      })
      .finally(() => setBusy(false));
  }

  function onLeave() {
    if (!mineId) return;
    setBusy(true);
    setError(null);
    void withdrawDaycareWaitlist({ data: { id: mineId } })
      .then(() => {
        setMineId(null);
        toast.success(copy.withdraw);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : copy.feeBlocked;
        setError(message);
      })
      .finally(() => setBusy(false));
  }

  return (
    <section id="join-waitlist" className="mt-4 rounded-lg bg-surface p-4 ring-1 ring-border" data-ke="join-waitlist">
      <h3 className="font-display text-xl">{copy.joinTitle}</h3>
      <p className="mt-1 text-sm text-muted">{copy.joinLead}</p>
      <p className="mt-1 text-sm text-muted">{copy.included}</p>
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {mineId ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/parent/spot-offers">{copy.seeMine}</Link>
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onLeave}>
            {copy.withdraw}
          </Button>
        </div>
      ) : (
        <form
          className="mt-3 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onJoin();
          }}
        >
          <label className="block text-sm" htmlFor={`waitlist-age-${daycareId}`}>
            {copy.ageLabel}
            <select
              id={`waitlist-age-${daycareId}`}
              className="ke-input mt-1 w-full"
              value={ageGroup}
              onChange={(event) => setAgeGroup(event.target.value)}
              onFocus={focusIn}
            >
              <option value="infant">{copy.infant}</option>
              <option value="toddler">{copy.toddler}</option>
              <option value="preschool">{copy.preschool}</option>
              <option value="any">{copy.any}</option>
            </select>
          </label>
          <label className="block text-sm" htmlFor={`waitlist-child-${daycareId}`}>
            {copy.childLabel}
            <input
              id={`waitlist-child-${daycareId}`}
              className="ke-input mt-1 w-full"
              value={childLabel}
              maxLength={40}
              autoComplete="given-name"
              onChange={(event) => setChildLabel(event.target.value)}
              onFocus={focusIn}
            />
          </label>
          <label className="block text-sm" htmlFor={`waitlist-note-${daycareId}`}>
            {copy.noteLabel}
            <textarea
              id={`waitlist-note-${daycareId}`}
              className="ke-input mt-1 w-full"
              value={note}
              maxLength={280}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              onFocus={focusIn}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {copy.join}
          </Button>
        </form>
      )}
    </section>
  );
}
