import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { useCopy } from "@/lib/use-copy";

export function AdminToolFrame({
  title,
  lead,
  on,
  notice,
  children,
}: {
  title: string;
  lead: string;
  on: boolean;
  notice?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useCopy();
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">{lead}</p>
        {notice}
        {on ? children : <p className="mt-6 text-sm text-muted">{t("adminToolOff")}</p>}
        <p className="mt-8">
          <Link to="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
            {t("adminToolBack")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
