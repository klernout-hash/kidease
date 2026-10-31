import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { growthAttribution, growthLoopsEnabled } from "@/lib/growth-loops";
import { localePath } from "@/lib/locale-path";
import { capturePostHogEvent } from "@/lib/posthog";
import { peekFamilyInvite } from "@/lib/server/growth-loops";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/welcome/$code")({
  head: () => ({
    meta: [
      { title: "A daycare invited your family · KidEase" },
      { name: "description", content: "Search licensed daycare near you. This invite does not pay cash." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WelcomePage,
});

export function WelcomePage() {
  const { code } = Route.useParams();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [centre, setCentre] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void peekFamilyInvite({ data: code })
      .then((row) => {
        if (!live) return;
        setCentre(row?.centreName ?? null);
        setReady(true);
        const hit = growthAttribution({
          enabled: growthLoopsEnabled() && Boolean(row),
          event: "family_invite_opened",
          code,
          locale,
        });
        if (hit) capturePostHogEvent(hit.event, hit.properties);
      })
      .catch(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [code, locale]);

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">
          {fr ? "Une garderie a invité votre famille" : "A daycare invited your family"}
        </h1>
        <p className="mt-4 text-muted">
          {fr
            ? "KidEase aide les parents à trouver une garderie permise. Le prochain pas est de chercher près de chez vous. Ce lien ne donne pas d’argent."
            : "KidEase helps parents find licensed daycare. The next step is to search near you. This link does not pay cash."}
        </p>
        {ready && centre ? (
          <p className="mt-4 text-sm font-medium">{fr ? `Invitation de ${centre}.` : `Invite from ${centre}.`}</p>
        ) : null}
        {ready && !centre ? (
          <p className="mt-4 text-sm" role="status">
            {fr
              ? "Les invitations aux familles sont éteintes, ou ce lien n’est plus actif."
              : "Family invites are off, or this link is no longer active."}
          </p>
        ) : null}
        <p className="mt-6">
          <Link
            to={localePath("/search", locale)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-medium text-primary-fg"
          >
            {fr ? "Chercher une garderie" : "Search daycare"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
