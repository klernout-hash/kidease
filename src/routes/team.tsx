import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/team")({ component: Team });

export function Team() {
  const { t } = useCopy();
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("team")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("team")}</h1>
        <p className="mt-6 text-lg text-muted">{t("teamIntro")}</p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-xl bg-surface p-6 ring-1 ring-border md:p-8">
            <div className="flex items-center gap-4">
              <img
                src="/photos/team/kyle-lernout.jpg"
                alt="Kyle Lernout"
                className="size-20 shrink-0 rounded-full object-cover object-[center_18%] ring-1 ring-border"
              />
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
              <img
                src="/photos/team/kevin-lamont.jpg"
                alt="Kevin Lamont"
                className="size-20 shrink-0 rounded-full object-cover object-[center_18%] ring-1 ring-border"
              />
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
