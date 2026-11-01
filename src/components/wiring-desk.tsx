import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { EmptyState } from "@/components/empty-state";
import { GovHelp } from "@/components/gov/gov-help";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

/**
 * One screen shell for a wiring feature. Help is on the page.
 * One primary action belongs in children. The off state offers home.
 */
export function WiringDesk({
  kicker,
  title,
  lead,
  next,
  enabled,
  gov = false,
  children,
}: {
  kicker: string;
  title: string;
  lead: string;
  next: string;
  enabled: boolean;
  gov?: boolean;
  children?: ReactNode;
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const help = localePath("/help", locale);
  return (
    <Shell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        <p className="text-sm font-semibold text-primary">{kicker}</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base leading-6">{lead}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{next}</p>
        {enabled ? <div className="mt-6">{children}</div> : (
          <div className="mt-6">
            <EmptyState
              title={fr ? "Cette étape est éteinte" : "This step is off"}
              body={fr ? "Rien n’est envoyé. Vous pouvez chercher une garderie ou demander de l’aide." : "Nothing is sent. You can search for daycare or get help."}
              action={fr ? "Chercher" : "Search daycare"}
              actionTo={localePath("/search", locale)}
              secondary={fr ? "Aide" : "Help"}
              secondaryTo={help}
            />
          </div>
        )}
        <p className="mt-8">
          {gov ? (
            <GovHelp locale={fr ? "fr" : "en"} />
          ) : (
            <Link
              to={help}
              className="inline-flex min-h-11 min-w-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
              data-ke="help"
            >
              {fr ? "Aide" : "Help"}
            </Link>
          )}
        </p>
      </main>
    </Shell>
  );
}
