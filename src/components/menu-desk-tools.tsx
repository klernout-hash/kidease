import { Link } from "@tanstack/react-router";
import { AdminDeskLink } from "@/components/admin-desk-link";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { canSeeAdminDesk, canVisitDesk, showDeskSwitcher } from "@/lib/desks";
import { useCopy } from "@/lib/use-copy";

/** Signed-in desk chrome for /menu — kept off the first menu JS chunk. */
export function MenuDeskTools() {
  const { locale } = useCopy();
  const { session } = useSessionDesks();
  const fr = locale === "fr";
  const multiDesk = Boolean(showDeskSwitcher(session?.desks, session?.role, session?.email));
  const showAdmin = Boolean(
    canSeeAdminDesk(session?.role, session?.email) &&
      session &&
      canVisitDesk(session.desks, "admin", session.role, session.email),
  );

  if (!multiDesk && !showAdmin) return null;

  return (
    <>
      {multiDesk ? (
        <section className="mt-7">
          <h2 className="px-1 text-[15px] font-bold text-fg">{fr ? "Vos espaces" : "Your desks"}</h2>
          <div className="mt-2 px-1 py-2">
            <DeskSwitcher />
          </div>
        </section>
      ) : null}
      {showAdmin ? (
        <section className="mt-7">
          <h2 className="px-1 text-[15px] font-bold text-fg">{fr ? "Équipe" : "Staff"}</h2>
          <div className="mt-2">
            <AdminDeskLink className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-1 text-[15px] text-fg last:border-b-0">
              {fr ? "Espace admin" : "Admin desk"}
              <span className="ke-menu-chevron" aria-hidden />
            </AdminDeskLink>
            {session?.desks.includes("support") ? (
              <Link
                to="/support"
                className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-1 text-[15px] text-fg last:border-b-0"
              >
                {fr ? "Espace soutien" : "Support desk"}
                <span className="ke-menu-chevron" aria-hidden />
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
