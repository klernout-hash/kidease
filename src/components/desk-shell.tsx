import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { Shell } from "@/components/shell";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { DESK_META, visibleDeskNav, type DeskIcon, type DeskId } from "@/lib/desk-nav";
import { cn } from "@/lib/utils";

function DeskItemIcon({ name, className }: { name?: DeskIcon; className?: string }) {
  if (name === "credit-card") return <CreditCard className={className} strokeWidth={1.8} />;
  return null;
}

export function DeskShell({
  desk,
  active,
  onSelect,
  children,
}: {
  desk: DeskId;
  active: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const meta = DESK_META[desk];
  const { session } = useSessionDesks();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = visibleDeskNav(desk, { providerSubscriptions: session?.providerSubscriptions });

  return (
    <Shell>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:items-start md:gap-8 md:py-10">
        <aside className="md:sticky md:top-24 md:w-56 md:shrink-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{meta.eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl">{meta.title}</h1>
          <div className="mt-3 md:hidden">
            <DeskSwitcher compact />
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {items.map((item) => {
              if (item.href) {
                const on =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.id}
                    to={item.href}
                    className={cn(
                      "min-h-11 shrink-0 rounded-full px-3 py-2 text-sm md:min-h-0 md:rounded-xl",
                      on
                        ? "bg-primary text-primary-fg"
                        : "text-muted ring-1 ring-border hover:text-fg md:ring-0 md:hover:bg-surface",
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
                      {item.label}
                    </span>
                    {item.hint ? (
                      <span className={cn("mt-0.5 hidden text-xs md:block", on ? "text-primary-fg/70" : "text-subtle")}>
                        {item.hint}
                      </span>
                    ) : null}
                  </Link>
                );
              }
              const on = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "min-h-11 shrink-0 rounded-full px-3 py-2 text-left text-sm md:min-h-0 md:rounded-xl",
                    on ? "bg-primary text-primary-fg" : "text-muted ring-1 ring-border hover:text-fg md:ring-0 md:hover:bg-surface",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
                    {item.label}
                  </span>
                  {item.hint ? (
                    <span className={cn("mt-0.5 hidden text-xs md:block", on ? "text-primary-fg/70" : "text-subtle")}>
                      {item.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Shell>
  );
}
