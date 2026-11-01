import { createFileRoute, Link } from "@tanstack/react-router";
import { WiringDesk } from "@/components/wiring-desk";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { claimNoticesEnabled } from "@/lib/wiring/claim-notices";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/claim-notices")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loader: () => ({ enabled: claimNoticesEnabled() }),
  head: () => ({ meta: [{ title: "Claim notices · KidEase" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { enabled } = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Avis de revendication" : "Claim notices"}
      lead={fr ? "Quand KidEase approuve ou refuse une revendication, le centre et la province reçoivent un avis." : "When KidEase approves or declines a claim, the centre and the province get a notice."}
      next={fr ? "Ouvrez votre boîte pour le lire." : "Open your inbox to read it."}
      enabled={enabled}
    >
      <Link to="/notifications" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-medium text-primary-fg">
        {fr ? "Ouvrir les avis" : "Open notices"}
      </Link>
    </WiringDesk>
  );
}
