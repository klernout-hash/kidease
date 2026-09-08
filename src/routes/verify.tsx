import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, BookOpen, Shield, Wallet } from "lucide-react";
import { FeelBanner } from "@/components/building-photo";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "How we verify listings · KidEase" },
      {
        name: "description",
        content:
          "KidEase explains how listing badges work: Manitoba catalogue matches, fail-closed stub registries, claim review, and official government records.",
      },
    ],
  }),
  component: VerifyPage,
});

export function VerifyPage() {
  const { t } = useCopy();
  const items = [
    { icon: BadgeCheck, title: t("verifyMbTitle"), body: t("verifyMbBody") },
    { icon: Shield, title: t("verifyStubTitle"), body: t("verifyStubBody") },
    { icon: BookOpen, title: t("verifyClaimTitle"), body: t("verifyClaimBody") },
    { icon: Wallet, title: t("verifyPayTitle"), body: t("verifyPayBody") },
  ];
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("verifyListings")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("verifyTitle")}</h1>
        <p className="mt-6 text-lg text-muted">{t("verifyLeadPage")}</p>
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
        <p className="mt-8 text-sm text-muted">{t("verifyOfficial")}</p>
        <p className="mt-6 text-sm">
          <Link to="/about" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("about")}
          </Link>
          {" · "}
          <Link to="/faq" className="font-medium text-primary underline-offset-4 hover:underline">
            FAQ
          </Link>
          {" · "}
          <Link to="/claim" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("claimCta")}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
