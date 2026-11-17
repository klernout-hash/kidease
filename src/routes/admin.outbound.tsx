import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AdminOutboundPage } from "@/components/admin-outbound-page";
import { Shell } from "@/components/shell";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadOutboundPage, saveOutboundSetting } from "@/lib/server/admin-outbound";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/admin/outbound")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadOutboundPage(),
  head: () => ({
    meta: [
      { title: "Outbound safety · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OutboundRoute,
});

function OutboundRoute() {
  const page = Route.useLoaderData();
  const router = useRouter();
  const { t, locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  return (
    <Shell>
      <main className="ke-admin-wrap mx-auto w-full min-w-0 max-w-3xl px-4 py-8">
        <h1 className="font-display text-[clamp(1.75rem,4vw,2.25rem)]">{t("adminNavOutbound")}</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted">{t("adminOutboundLead")}</p>
        <div className="mt-8">
          <AdminOutboundPage
            page={page}
            locale={lang}
            onSave={async (key, value) => {
              const r = await saveOutboundSetting({ data: { key, value } });
              if (r.ok) await router.invalidate();
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            }}
          />
        </div>
      </main>
    </Shell>
  );
}
