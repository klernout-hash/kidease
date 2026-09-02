import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSignContract, signCentreContract } from "@/lib/server/contracts";

export const Route = createFileRoute("/sign/$id")({ component: SignPage });

function SignPage() {
  const { id } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const [doc, setDoc] = useState<Awaited<ReturnType<typeof getSignContract>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getSignContract({ data: { contractId: id } })
      .then(setDoc)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load contract"));
  }, [user, id]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <Shell>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">KidEase agreement</p>
        <h1 className="mt-2 font-display text-3xl">{doc?.documentName || "Centre contract"}</h1>
        {doc ? (
          <p className="mt-2 text-sm text-muted">
            {doc.daycareName} · {doc.signerName || "Centre operator"} · {doc.status}
          </p>
        ) : null}
        {error ? <p className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
        {doc ? (
          <>
            <pre className="mt-6 whitespace-pre-wrap rounded-2xl bg-surface p-5 text-sm leading-relaxed ring-1 ring-border">
              {doc.body}
            </pre>
            <div className="mt-6 flex flex-wrap gap-2">
              {doc.status === "signed" ? (
                <p className="rounded-full bg-ok/15 px-3 py-2 text-sm text-ok">Already signed</p>
              ) : doc.demo ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void signCentreContract({ data: { contractId: id } })
                      .then(() => getSignContract({ data: { contractId: id } }).then(setDoc))
                      .catch((err) => setError(err instanceof Error ? err.message : "Could not sign"))
                      .finally(() => setBusy(false));
                  }}
                >
                  Sign this agreement
                </Button>
              ) : doc.signingUrl ? (
                <Button asChild>
                  <a href={doc.signingUrl}>Continue in DocuSign</a>
                </Button>
              ) : (
                <p className="text-sm text-muted">Waiting on DocuSign. Ask KidEase to resend the envelope.</p>
              )}
              <Button variant="secondary" asChild>
                <Link to="/provider">Back to centre desk</Link>
              </Button>
            </div>
          </>
        ) : !error ? (
          <p className="mt-6 text-muted">Loading the agreement…</p>
        ) : null}
      </main>
    </Shell>
  );
}
