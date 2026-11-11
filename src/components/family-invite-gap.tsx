import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { familyInviteFlag } from "@/lib/server/family-invite";
import { useCopy } from "@/lib/use-copy";

/**
 * Gap: a centre cannot connect an existing parent's child without a waitlist or a tour.
 * Hidden while FEATURE_FAMILY_INVITE is off. The button does not send email, SMS, or push.
 */
export function FamilyInviteGap() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [on, setOn] = useState(false);

  useEffect(() => {
    let live = true;
    void familyInviteFlag()
      .then((next) => {
        if (live) setOn(Boolean(next));
      })
      .catch(() => {
        if (live) setOn(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!on) return null;

  return (
    <section className="rounded-xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="family-invite-gap">
      <h2 className="font-display text-xl">{fr ? "Relier une famille" : "Connect a family"}</h2>
      <p className="mt-2 text-sm">
        {fr
          ? "Un centre ne peut pas encore relier l'enfant d'un parent qui a déjà un compte, sans liste d'attente ni visite."
          : "A centre cannot yet connect a child whose parent already has an account, without a waitlist or a tour."}
      </p>
      <p className="mt-2 text-sm font-medium" data-ke="family-invite-unsent">
        {fr ? "Rien n'est envoyé depuis cette page." : "Nothing is sent from this page."}
      </p>
      <Button type="button" className="mt-3" disabled>
        {fr ? "Ajouter un enfant" : "Add a child"}
      </Button>
    </section>
  );
}
