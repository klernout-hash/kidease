import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { DESK_PATH, openAdminDesk } from "@/lib/desks";

/**
 * Admin pill / hamburger / menu entry.
 * Always a real document GET to `/admin` so Cloudflare Access and
 * beforeLoad run on the desk page. TanStack Link SPA hops skip Access
 * and used to bounce a valid admin session back to `/`.
 */
export function AdminDeskLink({
  children,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openAdminDesk();
  }

  return (
    <a {...rest} href={DESK_PATH.admin} data-ke="admin-desk" onClick={handleClick}>
      {children}
    </a>
  );
}
