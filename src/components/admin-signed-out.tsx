import { Link } from "@tanstack/react-router";
import { ADMIN_LOGIN_SEARCH } from "@/lib/admin-desk-gate";

/** Signed-out /admin. A sign-in path, not an empty queue. */
export function AdminSignedOut() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-16 text-fg" data-ke="admin-signed-out">
      <h1 className="font-display text-2xl">Sign in</h1>
      <p className="mt-2 max-w-md text-sm text-muted">This page needs a sign-in. There is nothing to review until you are signed in.</p>
      <Link
        to="/login"
        search={ADMIN_LOGIN_SEARCH}
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-fg touch-manipulation"
      >
        Sign in
      </Link>
    </div>
  );
}
