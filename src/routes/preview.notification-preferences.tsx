import { useEffect } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { NotificationPreferences } from "@/components/notification-preferences";
import { Shell } from "@/components/shell";
import { isVercelProduction } from "@/lib/features";
import type { UnifiedAudience } from "@/lib/unified-alerts";

function previewWho(value: unknown): "parent" | "daycare" | "staff" | "admin" | "gov" {
  if (value === "parent" || value === "daycare" || value === "staff" || value === "admin" || value === "gov") return value;
  return "daycare";
}

export const Route = createFileRoute("/preview/notification-preferences")({
  validateSearch: (search: Record<string, unknown>) => ({
    look: search.look === "dark" ? ("dark" as const) : ("light" as const),
    lang: search.lang === "fr" ? ("fr" as const) : ("en" as const),
    who: previewWho(search.who),
    setup: search.setup === "push" ? ("push" as const) : undefined,
    held: search.held === "yes" ? ("yes" as const) : undefined,
  }),
  loader: () => {
    const open = !isVercelProduction() && String(process.env.KIDEASE_NOTIFICATION_PREVIEW || "") === "1";
    if (!open) throw notFound();
    return { open };
  },
  head: () => ({
    meta: [
      { title: "Notification preferences preview · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const { open } = Route.useLoaderData();
  const { look, lang, who, setup, held } = Route.useSearch();
  const audiences: UnifiedAudience[] = who === "gov" ? ["parent", "admin"] : [who];
  useEffect(() => {
    document.documentElement.setAttribute("data-resolved-theme", look);
    document.documentElement.setAttribute("data-theme", look);
    document.documentElement.lang = lang;
  }, [lang, look]);
  return (
    <Shell>
      <main className="mx-auto w-full max-w-lg px-4 py-6">
        {open ? (
          <NotificationPreferences preview localeOverride={lang} previewAudiences={audiences} previewPush={setup === "push"} previewSending={held !== "yes"} />
        ) : (
          <p>{lang === "fr" ? "Cet aperçu est fermé." : "This preview is closed."}</p>
        )}
      </main>
    </Shell>
  );
}
