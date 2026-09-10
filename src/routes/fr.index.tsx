import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ListChecks, MapPin, MessageCircle, Search } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { FeelPhoto, HeroYard } from "@/components/building-photo";
import { CityHubLinks } from "@/components/city-hub-links";
import { JsonLd } from "@/components/json-ld";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { TrustBar } from "@/components/trust-bar";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { consumeJustSignedOut, DESK_LANDED_KEY, homeLandPath, readStickyDesk, type AppRole } from "@/lib/desks";
import { getMyRole } from "@/lib/server/family";
import { MARKETING_PAGE_SEO_FR, organizationGraphJsonLdScript, pageSeoHead } from "@/lib/page-seo";
import { STEP_SIZES } from "@/lib/photo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/fr/")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.home),
  component: FrHome,
});

function FrHome() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    void getMyRole()
      .then((r) => setRole(r.role))
      .catch(() => setRole("parent"));
  }, [user]);

  useEffect(() => {
    if (isPending) return;
    try {
      if (sessionStorage.getItem(DESK_LANDED_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    if (consumeJustSignedOut()) return;
    if (!user) return;
    const dest = homeLandPath({ role, sticky: readStickyDesk() });
    if (!dest) return;
    try {
      sessionStorage.setItem(DESK_LANDED_KEY, "1");
    } catch {
      /* ignore */
    }
    void navigate({ to: dest });
  }, [isPending, user, role, navigate]);

  return (
    <Shell bare>
      <JsonLd json={organizationGraphJsonLdScript("fr")} />
      <section className="relative overflow-hidden bg-gradient-to-b from-[#eef2fb] via-bg to-bg">
        <div className="ke-gutter mx-auto grid max-w-6xl items-center gap-10 py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:py-20">
          <div>
            <BrandMark size="md" align="start" />
            <h1 className="mt-8 max-w-xl text-[clamp(2rem,6vw,3.25rem)] text-fg">{t("tagline")}</h1>
            <p className="mt-4 max-w-lg text-base text-muted md:text-lg">{t("heroSub")}</p>
            <p className="mt-3 max-w-lg text-sm text-muted">{t("officialLanguagesNote")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <Button asChild size="lg" className="h-14 min-h-14 w-full px-7 text-base sm:w-auto">
                <Link to="/fr/search">
                  <Search className="size-5" />
                  {t("heroCta")}
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="h-14 min-h-14 w-full px-7 text-base sm:w-auto">
                <Link to="/fr" hash="comment">{t("howItWorksCta")}</Link>
              </Button>
            </div>
            <CityHubLinks className="mt-5" />
            <p className="mt-6 text-xs font-medium text-muted">{t("heroTrust")}</p>
          </div>
          <div className="overflow-hidden rounded-xl shadow-lift ring-1 ring-border">
            <HeroYard />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="ke-gutter mx-auto max-w-6xl py-6">
          <TrustBar />
        </div>
      </section>

      <section id="comment" className="ke-gutter mx-auto max-w-6xl py-16">
        <h2 className="max-w-2xl text-[clamp(1.75rem,4vw,2.25rem)]">{t("howStressFree")}</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Step icon={MapPin} title={t("how1t")} body={t("how1")} photo="/photos/cottage.jpg" />
          <Step icon={ListChecks} title={t("how2t")} body={t("how2")} photo="/photos/playroom.jpg" />
          <Step icon={MessageCircle} title={t("how3t")} body={t("how3")} photo="/photos/kitchen.jpg" />
        </div>
      </section>

      <section className="bg-primary text-primary-fg">
        <div className="ke-gutter mx-auto max-w-3xl py-16 text-center">
          <h2 className="text-3xl text-primary-fg md:text-4xl">{t("finalCtaTitle")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-fg/90">{t("finalCtaBody")}</p>
          <Button asChild size="lg" variant="secondary" className="mt-8 h-14 min-h-14 px-7 text-base">
            <Link to="/search">{t("fullMapExplore")}</Link>
          </Button>
        </div>
      </section>
      <SiteFooter />
    </Shell>
  );
}

function Step({
  icon: Icon,
  title,
  body,
  photo,
}: {
  icon: typeof MapPin;
  title: string;
  body: string;
  photo: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
      <FeelPhoto src={photo} sizes={STEP_SIZES} className="aspect-[16/9] w-full object-cover" />
      <div className="p-6">
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h3 className="mt-4 text-xl">{title}</h3>
        <p className="mt-2 text-sm text-muted">{body}</p>
      </div>
    </div>
  );
}
