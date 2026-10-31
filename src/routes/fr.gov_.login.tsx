import { createFileRoute } from "@tanstack/react-router";
import { GovLogin, GovNativeNote } from "@/components/gov/gov-login";
import { guardGovLogin, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";

export const Route = createFileRoute("/fr/gov_/login")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => {
    const invite = typeof search.invite === "string" ? search.invite.slice(0, 200) : "";
    return invite ? { invite } : {};
  },
  beforeLoad: ({ context }) => guardGovLogin("fr", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  head: () => govRobotsHead("Connexion gouvernement · KidEase"),
  headers: govRobotsHeaders,
  component: LoginPageFr,
});

function LoginPageFr() {
  const native = Boolean((Route.useRouteContext() as { nativeShell?: boolean }).nativeShell);
  const { invite = "" } = Route.useSearch();
  if (native) return <GovNativeNote locale="fr" />;
  return <GovLogin locale="fr" invite={invite} />;
}
