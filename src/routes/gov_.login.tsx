import { createFileRoute } from "@tanstack/react-router";
import { GovLogin, GovNativeNote } from "@/components/gov/gov-login";
import { guardGovLogin, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";

export const Route = createFileRoute("/gov_/login")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => {
    const invite = typeof search.invite === "string" ? search.invite.slice(0, 200) : "";
    return invite ? { invite } : {};
  },
  beforeLoad: ({ context }) => guardGovLogin("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  head: () => govRobotsHead("Government sign-in · KidEase"),
  headers: govRobotsHeaders,
  component: LoginPage,
});

function LoginPage() {
  const native = Boolean((Route.useRouteContext() as { nativeShell?: boolean }).nativeShell);
  const { invite = "" } = Route.useSearch();
  if (native) return <GovNativeNote locale="en" />;
  return <GovLogin locale="en" invite={invite} />;
}
