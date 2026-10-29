import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { nativeAdminNoteCopy } from "@/lib/native-admin";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/use-the-website")({
  head: () => ({
    meta: [
      { title: "Admin is on the website · KidEase" },
      { name: "description", content: "Admin is available on kidease.ca in your web browser." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UseTheWebsitePage,
});

function UseTheWebsitePage() {
  const { locale } = useCopy();
  const copy = nativeAdminNoteCopy(locale);
  return (
    <Shell>
      <main className="ke-gutter mx-auto flex w-full min-w-0 max-w-lg flex-1 flex-col py-10" data-ke="admin-on-web">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,6vw,2.25rem)] leading-tight">{copy.title}</h1>
        <p className="mt-4 text-base text-fg">{copy.lead}</p>
        <p className="mt-3 text-base text-muted">{copy.body}</p>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link to="/">{copy.home}</Link>
        </Button>
      </main>
    </Shell>
  );
}
