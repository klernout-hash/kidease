import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/shell";
import { useSessionDesks } from "@/components/session-desks";
import { authClient } from "@/lib/auth/client";
import { useLocallySignedOut } from "@/lib/auth/use-current-user";
import { canVisitDesk } from "@/lib/desks";
import {
  adminQueueProofMatches,
  createAdminQueueRequestGuard,
  type AdminQueueProof,
} from "@/lib/admin-queue-bootstrap-state";
import {
  loadAdminQueueBootstrap,
  type AdminQueueBootstrap,
} from "@/lib/server/admin-queue-bootstrap";
import { LOADER_SETTLE_MS, withTimeout } from "@/lib/timeout";
import { useCopy } from "@/lib/use-copy";

/** Pure read-only summary; the caller must supply a complete server authorization result. */
export function AdminQueueSummary({
  proof,
  locale = "en",
}: {
  proof: AdminQueueProof;
  locale?: string;
}) {
  const fr = locale === "fr";
  const labels = fr
    ? ["En attente", "En ligne", "Refusées", "Total"]
    : ["Waiting", "Live", "Declined", "Total"];
  const values =
    proof.counts.status === "ready"
      ? [proof.counts.waiting, proof.counts.approved, proof.counts.declined, proof.counts.all]
      : null;
  return (
    <main
      className="mx-auto w-full max-w-3xl px-4 py-8 pb-[env(safe-area-inset-bottom)]"
      data-ke="admin-queue-bootstrap"
    >
      <h1 className="font-display text-2xl">
        {fr ? "Vérifier les fiches de garderies" : "Review daycare listings"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "L’espace admin KidEase vous aide à voir les fiches à vérifier. Commencez par les garderies en attente."
          : "KidEase admin helps you see which listings need review. Start with waiting daycares."}
      </p>
      <p className="mt-3 text-xs text-muted">
        {fr
          ? "Totaux de toutes les provinces. Les fiches de test sont exclues. Les filtres de la liste ne s’appliquent pas ici."
          : "Totals across all provinces. Test listings are excluded. List filters do not apply here."}
      </p>
      {values ? (
        <dl
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
          data-ke="admin-queue-bootstrap-counts"
        >
          {labels.map((label, i) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-2 font-display text-2xl tabular-nums">{values[i]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted" role="status">
          {fr
            ? "Les totaux ne sont pas disponibles. Ouvrez la file pour réessayer."
            : "Queue totals are unavailable. Open the queue to try again."}
        </p>
      )}
      <Button asChild className="mt-4">
        <Link to="/admin" search={{ tab: "queue" }}>
          {fr ? "Ouvrir la file d’attente" : "Open review queue"}
        </Link>
      </Button>
      <p className="mt-4 text-sm text-muted" role="status">
        {fr ? "Préparation des outils admin…" : "Preparing admin tools…"}
      </p>
    </main>
  );
}

/**
 * Only used while the unchanged admin gates/tools load. SSR uses the fully gated
 * request result; hydration immediately withholds it until a fresh full check.
 */
export function AdminQueueBootstrapFallback({ initial }: { initial: AdminQueueProof }) {
  const { locale } = useCopy();
  const { data, isPending, error: authError } = authClient.useSession();
  const locallyOut = useLocallySignedOut();
  const { session, ready, error: deskError } = useSessionDesks();
  const [hydrated, setHydrated] = useState(false);
  const [proof, setProof] = useState<AdminQueueBootstrap>(null);
  const [now, setNow] = useState(() => initial.checkedAt);
  const [failed, setFailed] = useState(false);
  const guard = useRef(createAdminQueueRequestGuard());
  const viewerId = data?.user.id ?? "";
  const sessionId = data?.session.id ?? "";
  const clientReady = Boolean(
    !locallyOut &&
    !isPending &&
    !authError &&
    viewerId &&
    sessionId &&
    ready &&
    !deskError &&
    session &&
    !session.viewAs &&
    canVisitDesk(session.desks, "admin", session.role, session.email),
  );
  const identityKey = `${viewerId}:${sessionId}`;

  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    const requests = guard.current;
    requests.invalidate();
    setProof(null);
    setFailed(false);
    if (!clientReady) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      requests.invalidate();
      setProof(null);
      if (timer) clearTimeout(timer);
    };
    const refresh = () => {
      clear();
      setFailed(false);
      if (document.visibilityState === "hidden") return;
      const request = requests.begin();
      void withTimeout(loadAdminQueueBootstrap(), LOADER_SETTLE_MS, "admin-bootstrap-timeout")
        .then((next) => {
          if (!requests.current(request)) return;
          const time = Date.now();
          setNow(time);
          if (!adminQueueProofMatches(next, { viewerId, sessionId }, time)) {
            setFailed(true);
            return;
          }
          setProof(next);
          timer = setTimeout(refresh, Math.max(1, next.expiresAt - time));
        })
        .catch(() => {
          if (requests.current(request)) {
            setProof(null);
            setFailed(true);
          }
        });
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") clear();
      else refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("blur", clear);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("blur", clear);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clientReady, identityKey, viewerId, sessionId]);

  const knownMismatch = Boolean(
    viewerId && (viewerId !== initial.viewerId || sessionId !== initial.sessionId),
  );
  const explicitDenial = Boolean(
    locallyOut ||
    authError ||
    (!isPending && !data?.user) ||
    (ready &&
      (deskError ||
        !session ||
        session.viewAs ||
        !canVisitDesk(session.desks, "admin", session.role, session.email))),
  );
  const shown =
    !hydrated &&
    !explicitDenial &&
    !knownMismatch &&
    adminQueueProofMatches(
      initial,
      { viewerId: initial.viewerId, sessionId: initial.sessionId },
      Date.now(),
    )
      ? initial
      : clientReady &&
          adminQueueProofMatches(proof, { viewerId, sessionId }, Math.max(now, Date.now()))
        ? proof
        : null;
  return (
    <Shell>
      {shown ? (
        <AdminQueueSummary proof={shown} locale={locale} />
      ) : (
        <main className="mx-auto w-full max-w-3xl px-4 py-8">
          <p role="status" className="text-sm text-muted">
            {failed || explicitDenial
              ? locale === "fr"
                ? "L’accès admin n’a pas pu être confirmé. Reconnectez-vous pour réessayer."
                : "Admin access could not be confirmed. Sign in to try again."
              : locale === "fr"
                ? "Vérification de l’accès admin…"
                : "Checking admin access…"}
          </p>
          <Link
            to="/login"
            search={{ role: "admin", desk: "admin", intent: "admin", next: "/admin" }}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            {locale === "fr" ? "Se connecter" : "Sign in"}
          </Link>
        </main>
      )}
    </Shell>
  );
}
