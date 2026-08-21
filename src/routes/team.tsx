import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/team")({ component: Team });

export function Team() {
  const { t } = useCopy();
  return (
    <Shell bare>
      <main className="mx-auto max-w-3xl px-5 py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("team")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("team")}</h1>
        <p className="mt-6 text-lg text-muted">{t("teamIntro")}</p>

        <div className="mt-10 space-y-6">
          <article className="rounded-xl bg-surface p-6 ring-1 ring-border md:p-8">
            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-fg">
                Ky
              </span>
              <div>
                <h2 className="text-2xl">Kyle Lernout</h2>
                <p className="text-sm font-medium text-primary">{t("kyleRole")}</p>
              </div>
            </div>
            <p className="mt-4 text-muted">{t("kyleBio1")}</p>
            <p className="mt-3 text-muted">{t("kyleBio2")}</p>
          </article>

          <article className="rounded-xl bg-surface p-6 ring-1 ring-border md:p-8">
            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-fg">
                Ke
              </span>
              <div>
                <h2 className="text-2xl">Kevin Lamont</h2>
                <p className="text-sm font-medium text-primary">{t("kevinRole")}</p>
              </div>
            </div>
            <p className="mt-4 text-muted">{t("kevinBio1")}</p>
            <p className="mt-3 text-muted">{t("kevinBio2")}</p>
          </article>
        </div>

        <h2 className="mt-12 text-2xl">{t("teamGoalT")}</h2>
        <p className="mt-3 text-muted">{t("teamGoal")}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
