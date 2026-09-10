import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { forgetRememberedRole, readRememberedRole, rememberRoleChoice } from "@/lib/desks";
import { setRole } from "@/lib/server/family";

export function rememberRole(role: "parent" | "provider") {
  rememberRoleChoice(role);
}

export function RoleBoot() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (isPending || !user) return;
    const role = readRememberedRole();
    if (!role) return;
    void setRole({ data: role }).finally(() => {
      forgetRememberedRole();
    });
  }, [user, isPending]);

  return null;
}
