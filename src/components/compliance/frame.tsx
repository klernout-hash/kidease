import type { ReactNode } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import type { PackMode } from "@/lib/compliance/mode";

export function ComplianceFrame({
  locale,
  title,
  copy,
  mode,
  gov,
  children,
}: {
  locale: "en" | "fr";
  title: string;
  copy: { what: string; why: string; help: string; home: string; off: string; practice: string };
  mode: PackMode;
  gov?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="w-full min-h-dvh overflow-x-hidden bg-bg text-fg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="font-display text-lg">KidEase</p>
        <div className="flex flex-wrap items-center gap-2">
          {gov ? <GovHelp locale={locale} /> : null}
          <a
            href="/help"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copy.help}
          </a>
          <a
            href={locale === "fr" ? "/fr" : "/"}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium underline-offset-4 hover:underline"
          >
            {copy.home}
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16">
        <p className="text-sm font-medium text-muted">{copy.what}</p>
        <h1 className="mt-1 font-display text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-base">{copy.why}</p>
        {mode === "off" ? <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">{copy.off}</p> : null}
        {mode === "dry_run" ? (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border" role="status">
            {copy.practice}
          </p>
        ) : null}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
