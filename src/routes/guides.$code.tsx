import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { provincialGuideCopy } from "@/lib/provincial-guide-copy";
import { CANADA_WIDE_CHILD_CARE_URL, provincialGuideByCode, provincialGuidePath } from "@/lib/provincial-guides";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";
import { isFrPath, localePath } from "@/lib/locale-path";
import { useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/$code")({
  loader: ({ params }) => {
    const pt = provincialGuideByCode(params.code);
    if (!pt) throw notFound();
    return pt;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Guide · KidEase" }] };
    return pageSeoHead({
      title: `${loaderData.nameEn} child care guide · KidEase`,
      description: `Official links for fees, subsidy, waitlists, and licensing in ${loaderData.nameEn}.`,
      path: provincialGuidePath(loaderData.code),
    });
  },
  component: GuidePage,
  notFoundComponent: MissingGuide,
});

export function GuideView({
  pt,
}: {
  pt: {
    code: string;
    nameEn: string;
    nameFr: string;
    licensingFirstEn: string;
    licensingFirstFr: string;
    licensingUrl: string;
    fundingEn: string;
    fundingFr: string;
    fundingUrl: string;
  };
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { locale } = useCopy();
  const fr = isFrPath(pathname) || locale === "fr";
  const copy = provincialGuideCopy(fr ? "fr" : "en");
  const name = fr ? pt.nameFr : pt.nameEn;
  const first = fr ? pt.licensingFirstFr : pt.licensingFirstEn;
  const funding = fr ? pt.fundingFr : pt.fundingEn;
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.title(name)}</h1>
        <p className="mt-4 text-lg text-muted">{copy.what}</p>
        <p className="mt-2 text-muted">{copy.why}</p>
        <p className="mt-2 text-muted">{copy.lead}</p>
        <p className="mt-4">
          <Button asChild>
            <a href="/claim">{copy.create}</a>
          </Button>
        </p>
        <section className="mt-8">
          <h2 className="font-display text-2xl">{copy.feesTitle}</h2>
          <p className="mt-2 text-muted">{copy.feesBody}</p>
          <p className="mt-2 text-muted">{funding}</p>
          <p className="mt-2">
            <a className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={CANADA_WIDE_CHILD_CARE_URL}>
              {copy.canadaWide}
            </a>
          </p>
          <p>
            <a className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={pt.fundingUrl}>
              {copy.official}
            </a>
          </p>
        </section>
        <section className="mt-8">
          <h2 className="font-display text-2xl">{copy.subsidyTitle}</h2>
          <p className="mt-2 text-muted">{copy.subsidyBody}</p>
          <p className="mt-2">
            <a className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={pt.fundingUrl}>
              {copy.official}
            </a>
          </p>
        </section>
        <section className="mt-8">
          <h2 className="font-display text-2xl">{copy.waitlistTitle}</h2>
          <p className="mt-2 text-muted">{copy.waitlistBody}</p>
          <p className="mt-2">
            <a className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={pt.licensingUrl}>
              {copy.official}
            </a>
          </p>
        </section>
        <section className="mt-8">
          <h2 className="font-display text-2xl">{copy.startTitle}</h2>
          <p className="mt-2 text-muted">{first}</p>
          <p className="mt-2">
            <a className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={pt.licensingUrl}>
              {copy.official}
            </a>
          </p>
        </section>
        <p className="mt-8">
          <Link to={localePath("/guides", fr ? "fr" : "en")} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
            {copy.back}
          </Link>
        </p>
      </main>
    </Shell>
  );
}

function GuidePage() {
  const pt = Route.useLoaderData();
  return <GuideView pt={pt} />;
}

function MissingGuide() {
  const { locale } = useCopy();
  const copy = provincialGuideCopy(locale);
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto w-full max-w-lg py-10">
        <EmptyState title={copy.missing} action={copy.home} actionTo={localePath("/search", locale)} />
      </main>
    </Shell>
  );
}
