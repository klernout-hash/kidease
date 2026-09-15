import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, FileCheck, Home, Shield, Users } from "lucide-react";
import { FeelBanner } from "@/components/building-photo";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/daycare-requirements")({
  head: () => ({
    meta: [
      { title: "Daycare requirements · KidEase" },
      {
        name: "description",
        content:
          "What parents should expect and what licensed daycares must provide: a provincial or territorial licence, Vulnerable Sector Checks from police, and any extra provincial registry documents. KidEase reviews files — it does not issue police checks.",
      },
    ],
  }),
  component: DaycareRequirementsPage,
});

export function DaycareRequirementsPage() {
  const { t } = useCopy();
  const items = [
    { icon: Home, title: t("reqParentsTitle"), body: t("reqParentsBody") },
    { icon: Users, title: t("reqDaycaresTitle"), body: t("reqDaycaresBody") },
    { icon: BadgeCheck, title: t("reqKidEaseTitle"), body: t("reqKidEaseBody") },
    { icon: Shield, title: t("reqPoliceTitle"), body: t("reqPoliceBody") },
    { icon: FileCheck, title: t("reqMbTitle"), body: t("reqMbBody") },
  ];
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("daycareRequirements")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("reqTitle")}</h1>
        <p className="mt-6 text-lg text-muted">{t("reqLead")}</p>
        <FeelBanner src="/photos/community.jpg" className="mt-8" />
        <ul className="mt-10 space-y-4">
          {items.map((item) => (
            <li key={item.title} className="flex gap-3 rounded-xl bg-surface p-5 ring-1 ring-border">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <item.icon className="size-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm leading-6 text-muted">{t("reqPrivacyBody")}</p>
        <p className="mt-6 text-sm">
          <Link to="/verify" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("verifyListings")}
          </Link>
          {" · "}
          <Link to="/about" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("about")}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
