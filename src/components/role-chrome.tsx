import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/session-desks";
import { chromeRole, type ChromeRole } from "@/lib/role-access";
import { getRoleChrome, type RoleChromePayload } from "@/lib/server/role-route";

export type RoleChromeState = {
  pending: boolean;
  role: ChromeRole;
  paid: boolean;
  planLabel: string | null;
  renewsOn: string | null;
  ownedSlugs: string[];
  e2e: boolean;
};

const GUEST: RoleChromeState = {
  pending: false,
  role: "guest",
  paid: false,
  planLabel: null,
  renewsOn: null,
  ownedSlugs: [],
  e2e: false,
};

export function useRoleChrome(): RoleChromeState {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const [remote, setRemote] = useState<RoleChromePayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    void getRoleChrome()
      .then((row) => {
        if (!cancel) setRemote(row);
      })
      .catch(() => {
        if (!cancel) setRemote(null);
      })
      .finally(() => {
        if (!cancel) setLoaded(true);
      });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  if (remote?.e2e && remote.role) {
    return {
      pending: false,
      role: chromeRole(remote.role),
      paid: remote.paid,
      planLabel: remote.planLabel,
      renewsOn: remote.renewsOn,
      ownedSlugs: remote.ownedSlugs,
      e2e: true,
    };
  }

  if (user && session) {
    return {
      pending: false,
      role: chromeRole(session.role),
      paid: remote?.paid ?? false,
      planLabel: remote?.planLabel ?? null,
      renewsOn: remote?.renewsOn ?? null,
      ownedSlugs: remote?.ownedSlugs ?? [],
      e2e: false,
    };
  }

  if (isPending || (user && !ready) || !loaded) {
    return { ...GUEST, pending: true };
  }
  return GUEST;
}
