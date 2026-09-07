import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { signedPdfPath } from "@/lib/docusign-packs";
import { ds } from "@/lib/docusign-copy";
import { useCopy } from "@/lib/use-copy";
import { listProviderContracts, type ProviderContractRow } from "@/lib/server/contracts";

export function ProviderContractsPanel() {
  const { locale } = useCopy();
  const [rows, setRows] = useState<ProviderContractRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void listProviderContracts()
      .then(setRows)
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <p className="text-muted">Loading contracts…</p>;

  if (rows.length === 0) {
    return (
      <section className="rounded-xl bg-surface px-5 py-8 text-center ring-1 ring-border">
        <h2 className="font-display text-2xl">{ds(locale, "providerTitle")}</h2>
        <p className="mt-2 text-sm text-muted">{ds(locale, "providerEmpty")}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <section key={r.id} className="rounded-xl bg-surface p-5 ring-1 ring-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">{r.daycareName}</h2>
              <p className="mt-1 text-sm text-muted">
                {r.packKind === "enrolment_pack" ? ds(locale, "packEnrolment") : ds(locale, "packAgreement")}
                {" · "}
                {r.documentName} · {r.status}
                {r.signedAt ? ` · signed ${new Date(r.signedAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            {r.status === "signed" ? (
              <span className="rounded-full bg-ok/15 px-3 py-1 text-sm text-ok">{ds(locale, "providerSigned")}</span>
            ) : (
              <Button size="sm" asChild>
                <Link to="/sign/$id" params={{ id: r.id }}>
                  {ds(locale, "providerReview")}
                </Link>
              </Button>
            )}
          </div>
          {r.status === "signed" && r.hasSignedPdf ? (
            <p className="mt-3 text-sm">
              <a className="text-primary underline" href={signedPdfPath(r.id)}>
                {ds(locale, "download")}
              </a>
              <span className="ml-2 text-muted">{ds(locale, "reviewOnProfile")}</span>
            </p>
          ) : null}
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm leading-relaxed">
            {r.body}
          </pre>
        </section>
      ))}
    </div>
  );
}
