import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { listProviderContracts, type ProviderContractRow } from "@/lib/server/contracts";

export function ProviderContractsPanel() {
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
        <h2 className="font-display text-2xl">Centre agreement</h2>
        <p className="mt-2 text-sm text-muted">
          When KidEase sends the licensed centre agreement, it will show up here for you to sign.
        </p>
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
                {r.documentName} · {r.status}
                {r.signedAt ? ` · signed ${new Date(r.signedAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            {r.status === "signed" ? (
              <span className="rounded-full bg-ok/15 px-3 py-1 text-sm text-ok">Signed</span>
            ) : (
              <Button size="sm" asChild>
                <Link to="/sign/$id" params={{ id: r.id }}>
                  Review and sign
                </Link>
              </Button>
            )}
          </div>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm leading-relaxed">
            {r.body}
          </pre>
        </section>
      ))}
    </div>
  );
}
