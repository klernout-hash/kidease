import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRoleChrome } from "@/components/role-chrome";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AREA_WAITLIST_RADII } from "@/lib/area-waitlist";
import { areaWaitlistCopy } from "@/lib/area-waitlist-copy";
import { showsParentBrowseActions } from "@/lib/role-access";
import { joinAreaWaitlist } from "@/lib/server/area-waitlist";
import { useCopy } from "@/lib/use-copy";

const DRAFT_KEY = "kidease-area-waitlist-draft";

type Draft = {
  place: string;
  radiusKm: number;
  ageGroup: string;
  startDate: string;
};

function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      place: String(parsed.place || "").slice(0, 80),
      radiusKm: Number(parsed.radiusKm) || 10,
      ageGroup: String(parsed.ageGroup || "any"),
      startDate: String(parsed.startDate || "").slice(0, 10),
    };
  } catch {
    return null;
  }
}

export function AreaWaitlistForm({
  returnTo = "/parent?tab=waitlists",
  primary = false,
  onJoined,
}: {
  returnTo?: string;
  primary?: boolean;
  onJoined?: () => void;
}) {
  const { locale } = useCopy();
  const copy = areaWaitlistCopy(locale);
  const chrome = useRoleChrome();
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const [place, setPlace] = useState("");
  const [radiusKm, setRadiusKm] = useState(10);
  const [ageGroup, setAgeGroup] = useState("any");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setPlace(draft.place);
    setRadiusKm(draft.radiusKm);
    setAgeGroup(draft.ageGroup);
    setStartDate(draft.startDate);
  }, []);

  if (!showsParentBrowseActions(chrome.role)) return null;

  function focusIn(event: { currentTarget: HTMLElement }) {
    event.currentTarget.scrollIntoView({ block: "center" });
  }

  function fail(code: string) {
    if (code === "place") return copy.placeMiss;
    if (code === "daycare") return copy.daycareBlocked;
    if (code === "cap") return copy.cap;
    if (code === "date") return copy.badDate;
    return copy.needPlace;
  }

  function onSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    setError(null);
    if (!place.trim()) {
      setError(copy.needPlace);
      return;
    }
    if (!user) {
      const draft: Draft = { place: place.trim(), radiusKm, ageGroup, startDate };
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      void navigate({ to: "/login", search: parentLoginSearch(returnTo) });
      return;
    }
    setBusy(true);
    void joinAreaWaitlist({ data: { place: place.trim(), radiusKm, ageGroup, startDate } })
      .then((result) => {
        if (!result.ok) {
          setError(fail(result.error));
          return;
        }
        window.sessionStorage.removeItem(DRAFT_KEY);
        toast.success(copy.joined);
        setPlace("");
        setStartDate("");
        onJoined?.();
      })
      .catch(() => setError(copy.placeMiss))
      .finally(() => setBusy(false));
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="area-waitlist-form">
      <div>
        <h2 className="font-display text-xl">{copy.areaTitle}</h2>
        <p className="mt-1 text-sm text-muted">{copy.areaLead}</p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <label className="block text-sm" htmlFor="area-waitlist-place">
        {copy.placeLabel}
        <input
          id="area-waitlist-place"
          className="ke-input mt-1 w-full"
          value={place}
          maxLength={80}
          autoComplete="postal-code"
          placeholder={copy.placeHint}
          onChange={(event) => setPlace(event.target.value)}
          onFocus={focusIn}
          required
        />
      </label>
      <label className="block text-sm" htmlFor="area-waitlist-radius">
        {copy.radiusLabel}
        <select
          id="area-waitlist-radius"
          className="ke-input mt-1 w-full"
          value={radiusKm}
          onChange={(event) => setRadiusKm(Number(event.target.value))}
          onFocus={focusIn}
        >
          {AREA_WAITLIST_RADII.map((km) => (
            <option key={km} value={km}>
              {copy.radiusKm.replace("{n}", String(km))}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm" htmlFor="area-waitlist-age">
        {copy.ageLabel}
        <select
          id="area-waitlist-age"
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
      <label className="block text-sm" htmlFor="area-waitlist-start">
        {copy.startLabel}
        <input
          id="area-waitlist-start"
          className="ke-input mt-1 w-full"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          onFocus={focusIn}
        />
        <span className="mt-1 block text-xs text-subtle">{copy.startHint}</span>
      </label>
      <Button type="submit" variant={primary ? "primary" : "secondary"} disabled={busy}>
        {copy.join}
      </Button>
    </form>
  );
}
