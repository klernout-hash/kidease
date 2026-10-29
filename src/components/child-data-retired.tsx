import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

/** Shown where a child profile, health record, or journal used to be. */
export function ChildDataRetired() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <section className="ph-no-capture mt-6 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="child-data-retired">
      <h2 className="font-display text-2xl">{fr ? "Pas de profil d’enfant" : "No child profile"}</h2>
      <p className="mt-2 text-base text-fg">
        {fr
          ? "KidEase ne demande pas le prénom, la date de naissance, la santé, les allergies, les vaccins, les médicaments ou un journal. Choisissez une tranche d’âge, puis écrivez à la garderie."
          : "KidEase does not ask for a child’s name, birthdate, health, allergies, immunization, medicines, or a journal. Pick an age range, then message the daycare."}
      </p>
      <Button asChild className="mt-4 w-full sm:w-auto">
        <Link to={localePath("/search", locale)}>{fr ? "Chercher une garderie" : "Search daycares"}</Link>
      </Button>
    </section>
  );
}
