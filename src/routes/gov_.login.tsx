import { createFileRoute } from "@tanstack/react-router";
import { GovClosedNote, GovLogin, GovNativeNote } from "@/components/gov/gov-login";
import { guardGovLogin, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";

export const Route = createFileRoute("/gov_/login")({
  validateSearch: (search: Record<string, unknown>): { invite?: string; closed?: string } => {
    const invite = typeof search.invite === "string" ? search.invite.slice(0, 200) : "";
    const closed = search.closed === "1" || search.closed === 1 ? "1" : "";
    return { ...(invite ? { invite } : {}), ...(closed ? { closed } : {}) };
  },
  beforeLoad: ({ context }) => guardGovLogin("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  head: () => govRobotsHead("Government sign-in · KidEase"),
  headers: govRobotsHeaders,
  component: LoginPage,
});

function LoginPage() {
  const native = Boolean((Route.useRouteContext() as { nativeShell?: boolean }).nativeShell);
  const { invite = "", closed = "" } = Route.useSearch();
  const gate = Route.useRouteContext() as { closed?: boolean };
  if (native) return <GovNativeNote locale="en" />;
  if (closed === "1" || gate.closed === true) return <GovClosedNote locale="en" />;
  return <GovLogin locale="en" invite={invite} />;
}
