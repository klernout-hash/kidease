import { useRouteContext } from "@tanstack/react-router";
import { chromeRole, type ChromeRole } from "@/lib/role-access";
import type { RoleChromePayload } from "@/lib/server/role-route";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export type RoleChromeState = {
  pending: boolean;
  signedIn: boolean;
  role: ChromeRole;
  paid: boolean;
  planLabel: string | null;
  renewsOn: string | null;
  ownedSlugs: string[];
  e2e: boolean;
  subscriptionsEnabled: boolean;
};

const GUEST: RoleChromeState = {
  pending: false,
  signedIn: false,
  role: "guest",
  paid: false,
  planLabel: null,
  renewsOn: null,
  ownedSlugs: [],
  e2e: false,
  subscriptionsEnabled: false,
};

/**
 * The root beforeLoad already loaded role chrome for this request.
 * While that payload is missing, hide role menus instead of flashing guest links.
 * A signed-in visitor with a server role keeps that role even if the client
 * session desks have not arrived.
 */
export function useRoleChrome(): RoleChromeState {
  const ctx = useRouteContext({ from: "__root__" }) as { roleChrome?: RoleChromePayload };
  const remote = ctx.roleChrome;
  const { user, isPending } = useCurrentUserState();

  if (remote?.role) {
    return {
      pending: false,
      signedIn: true,
      role: chromeRole(remote.role),
      paid: remote.paid,
      planLabel: remote.planLabel,
      renewsOn: remote.renewsOn,
      ownedSlugs: remote.ownedSlugs,
      e2e: remote.e2e,
      subscriptionsEnabled: remote.subscriptionsEnabled === true,
    };
  }

  if (remote?.signedIn || remote?.degraded || isPending || user) {
    return { ...GUEST, pending: true, signedIn: true };
  }

  if (!remote) return { ...GUEST, pending: true };
  return GUEST;
}
