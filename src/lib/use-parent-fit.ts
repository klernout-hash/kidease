import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { ParentFitProfile } from "@/lib/parent-fit";
import { loadParentFitFacts } from "@/lib/server/parent-fit-facts";

export type ParentFitFactsState = {
  signedIn: boolean;
  childAgeMonths: number | null;
  languages: string[];
};

const EMPTY: ParentFitFactsState = { signedIn: false, childAgeMonths: null, languages: [] };

/** Signed-in parents only. Guests and the auth-off sandbox stay on fresh-first. */
export function useParentFitFacts(): ParentFitFactsState {
  const { user } = useCurrentUserState();
  const signedIn = Boolean(user && !user.isDevFallback);
  const [facts, setFacts] = useState<ParentFitFactsState>(EMPTY);

  useEffect(() => {
    if (!signedIn) {
      setFacts(EMPTY);
      return;
    }
    let live = true;
    void loadParentFitFacts()
      .then((row) => {
        if (!live) return;
        setFacts({
          signedIn: true,
          childAgeMonths: row.childAgeMonths,
          languages: row.languages,
        });
      })
      .catch(() => {
        if (live) setFacts({ signedIn: true, childAgeMonths: null, languages: [] });
      });
    return () => {
      live = false;
    };
  }, [signedIn, user?.id]);

  return signedIn ? facts : EMPTY;
}

export function parentFitFromSearch(input: {
  facts: ParentFitFactsState;
  home?: { lat: number; lng: number } | null;
  work?: { lat: number; lng: number } | null;
  radiusKm?: number;
  budgetMonthly?: number | null;
  wantSubsidy?: boolean;
}): ParentFitProfile | null {
  if (!input.facts.signedIn) return null;
  return {
    guest: false,
    childAgeMonths: input.facts.childAgeMonths,
    languages: input.facts.languages,
    home: input.home ?? null,
    work: input.work ?? null,
    radiusKm: input.radiusKm,
    budgetMonthly: input.budgetMonthly ?? null,
    wantSubsidy: input.wantSubsidy === true,
  };
}
