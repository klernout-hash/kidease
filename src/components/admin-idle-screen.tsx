import { Link } from "@tanstack/react-router";
import { ADMIN_IDLE_TIMEOUT_MESSAGE } from "@/lib/admin-centres-load";
import { ADMIN_LOGIN_SEARCH } from "@/lib/admin-desk-gate";

/** Full-screen sign-in when the admin session expires. No banner under tools. */
export function AdminIdleScreen({
  message = ADMIN_IDLE_TIMEOUT_MESSAGE,
}: {
  message?: string;
}) {
  return (
    <main
      data-ke="admin-idle-screen"
      className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-sm font-medium uppercase tracking-[0.14em] text-subtle">Admin</p>
      <h1 className="mt-2 font-display text-2xl">{message}</h1>
      <p className="mt-2 text-sm text-muted">Password and 2FA run before the queue loads again.</p>
      <Link
        to="/login"
        search={ADMIN_LOGIN_SEARCH}
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg"
      >
        Sign in again
      </Link>
    </main>
  );
}
