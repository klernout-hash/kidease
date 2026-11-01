import { createFileRoute, Link } from "@tanstack/react-router";
import { GovHelp } from "@/components/gov/gov-help";
import { GovNativeNote } from "@/components/gov/gov-login";
import { WiringDesk } from "@/components/wiring-desk";
import { guardGovDesk, govRobotsHead } from "@/lib/gov/desk-guard";
import { claimNoticesEnabled } from "@/lib/wiring/claim-notices";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/gov_/claim-notices")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: () => ({ enabled: claimNoticesEnabled() }),
  head: () => govRobotsHead("Claim notices · KidEase"),
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  if (gate.nativeOnly) {
    return <main className="mx-auto w-full max-w-lg px-4 py-10"><GovNativeNote locale={fr ? "fr" : "en"} /><GovHelp locale={fr ? "fr" : "en"} /></main>;
  }
  return (
    <WiringDesk gov kicker="KidEase" title={fr ? "Avis de revendication" : "Claim notices"} lead={fr ? "Vous voyez les décisions des centres de votre province." : "You see claim decisions for centres in your province."} next={fr ? "Ouvrez la boîte du bureau." : "Open the desk inbox."} enabled={enabled}>
      <Link to="/gov/notifications" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-medium text-primary-fg">
        {fr ? "Ouvrir les avis" : "Open notices"}
      </Link>
    </WiringDesk>
  );
}
