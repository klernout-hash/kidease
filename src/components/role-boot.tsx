import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { setRole } from "@/lib/server/family";

export function rememberRole(role: "parent" | "provider") {
  try {
    window.localStorage.setItem("kidease-role", role);
  } catch {
    /* ignore */
  }
}

export function RoleBoot() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (isPending || !user) return;
    let role: string | null = null;
    try {
      role = window.localStorage.getItem("kidease-role");
    } catch {
      role = null;
    }
    if (role !== "parent" && role !== "provider") return;
    void setRole({ data: role }).finally(() => {
      try {
        window.localStorage.removeItem("kidease-role");
      } catch {
        /* ignore */
      }
    });
  }, [user, isPending]);

  return null;
}
