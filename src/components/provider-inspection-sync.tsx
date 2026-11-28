import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { useSessionDesks } from "@/components/session-desks";
import { WiringDesk } from "@/components/wiring-desk";
import { useCopy } from "@/lib/use-copy";
import { ToolPending } from "@/components/tool-states";
import { OwnerOnlyNotice } from "@/components/owner-only-notice";

export function ProviderInspectionSync({ enabled }: { enabled: boolean }) {
  const { locale } = useCopy();
  const { session, ready } = useSessionDesks();
  const fr = locale === "fr";
  if (!ready) return <ToolPending />;
  if (!session?.centreOwner) {
    return (
      <Shell>
        <main className="mx-auto max-w-3xl px-4 py-6">
          <OwnerOnlyNotice />
        </main>
      </Shell>
    );
  }
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Inspections" : "Inspections"}
      lead={fr ? "Le résultat public montre la source et la date. KidEase n’invente pas un résultat." : "The public summary shows the source and the date. KidEase does not invent a result."}
      next={fr ? "Ouvrez votre fiche publique pour le voir." : "Open your public listing to see it."}
      enabled={enabled}
    >
      <Link to="/search" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 font-medium text-primary-fg">
        {fr ? "Voir les fiches" : "See listings"}
      </Link>
    </WiringDesk>
  );
}
