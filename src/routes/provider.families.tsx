import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { familyInvitePath, growthAttribution } from "@/lib/growth-loops";
import { capturePostHogEvent } from "@/lib/posthog";
import { createFamilyInvite, loadGrowthSummary } from "@/lib/server/growth-loops";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider/families")({
  loader: () => loadGrowthSummary().catch(() => ({ enabled: false as const, thankYous: 0, invite: null })),
  head: () => ({
    meta: [
      { title: "Invite families · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FamiliesPage,
});

function FamiliesPage() {
  const initial = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [invite, setInvite] = useState(initial.invite);
  const [reason, setReason] = useState<string | null>(initial.enabled ? null : "off");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const result = await createFamilyInvite();
      if (result.ok) {
        setInvite({ code: result.code, centreName: result.centreName, opens: invite?.opens ?? 0 });
        setReason(null);
        const hit = growthAttribution({ enabled: true, event: "family_invite_created", code: result.code, locale });
        if (hit) capturePostHogEvent(hit.event, hit.properties);
      } else {
        setReason(result.reason);
      }
    } catch {
      setReason("error");
    } finally {
      setBusy(false);
    }
  }

  const path = invite ? familyInvitePath(invite.code, locale) : "";
  const url = path ? `https://www.kidease.ca${path}` : "";

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{fr ? "Inviter vos familles" : "Invite your families"}</h1>
        <p className="mt-4 text-muted">
          {fr
            ? "Partagez un lien vers KidEase. Les parents cherchent une garderie permise. Le lien ne paie pas d’argent et n’ajoute pas d’abonnement."
            : "Share a link to KidEase. Parents search for licensed daycare. The link does not pay cash and does not add a subscription."}
        </p>
        {reason === "off" ? (
          <p className="mt-4 text-sm" role="status">
            {fr ? "Cette invitation est éteinte pour le moment." : "This invite is off for now."}
          </p>
        ) : null}
        {reason === "no_centre" ? (
          <p className="mt-4 text-sm" role="status">
            {fr ? "Revendiquez votre fiche d’abord." : "Claim your listing first."}{" "}
            <Link to="/claim" className="font-medium text-primary underline-offset-4 hover:underline">
              {fr ? "Revendiquer" : "Claim"}
            </Link>
          </p>
        ) : null}
        {invite && url ? (
          <p className="mt-4 break-all text-sm">{url}</p>
        ) : reason === "off" ? null : (
          <Button type="button" className="mt-6" disabled={busy} onClick={() => void create()}>
            {fr ? "Créer le lien" : "Create the link"}
          </Button>
        )}
        <p className="mt-8">
          <Link to="/provider" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            {fr ? "Retour au bureau" : "Back to the desk"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
