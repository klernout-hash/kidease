import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Camera, MapPin, ListChecks } from "lucide-react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/about")({ component: About });

export function About() {
  const { t } = useCopy();
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("about")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("aboutTitle")}</h1>
        <p className="mt-6 text-lg text-muted">{t("aboutHero")}</p>
        <p className="mt-4 text-muted">{t("aboutIntro")}</p>

        <h2 className="mt-12 text-2xl">{t("aboutMissionT")}</h2>
        <p className="mt-3 text-muted">{t("aboutMission")}</p>

        <h2 className="mt-12 text-2xl">{t("aboutDifferentT")}</h2>
        <ul className="mt-5 space-y-3">
          <Diff icon={BadgeCheck} text={t("aboutDiff1")} />
          <Diff icon={Camera} text={t("aboutDiff2")} />
          <Diff icon={MapPin} text={t("aboutDiff3")} />
          <Diff icon={ListChecks} text={t("aboutDiff4")} />
        </ul>

        <h2 className="mt-12 text-2xl">{t("aboutLocalT")}</h2>
        <p className="mt-3 text-muted">{t("aboutLocal1")}</p>
        <p className="mt-3 text-muted">{t("aboutLocal2")}</p>

        <h2 className="mt-12 text-2xl">{t("aboutCommitT")}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
          <li>{t("aboutCommit1")}</li>
          <li>{t("aboutCommit2")}</li>
          <li>{t("aboutCommit3")}</li>
          <li>{t("aboutCommit4")}</li>
          <li>{t("aboutCommit5")}</li>
        </ul>
        <h2 id="verify" className="mt-12 scroll-mt-24 text-2xl">{t("verifyHowTitle")}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
          <li>{t("verifyHow1")}</li>
          <li>{t("verifyHow2")}</li>
          <li>{t("verifyHow3")}</li>
          <li>{t("verifyHow4")}</li>
        </ul>
        <p className="mt-8 font-medium">{t("aboutClose")}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}

function Diff({ icon: Icon, text }: { icon: typeof BadgeCheck; text: string }) {
  return (
    <li className="flex gap-3 rounded-xl bg-surface p-4 ring-1 ring-border">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="text-sm leading-relaxed">{text}</p>
    </li>
  );
}
