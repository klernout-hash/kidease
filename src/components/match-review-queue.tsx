import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listMatchReviewRequests, markMatchReviewAnswered, type MatchReviewRow } from "@/lib/server/staff-jobs";

/**
 * Admin queue for "ask a person to review this match" requests (Quebec Law 25).
 * Shows who asked, what they wrote and the 30-day answer date. Sends no email:
 * the admin replies from privacy@kidease.ca, then marks the request answered.
 */
export function MatchReviewQueue({ fr }: { fr: boolean }) {
  const [rows, setRows] = useState<MatchReviewRow[] | null>(null);
  const [state, setState] = useState<"loading" | "off" | "forbidden" | "error" | "ready">("loading");
  const [busyId, setBusyId] = useState("");

  function load() {
    void listMatchReviewRequests()
      .then((result) => {
        if (result.ok) {
          setRows(result.requests);
          setState("ready");
        } else {
          setState(result.reason === "off" ? "off" : result.reason === "forbidden" ? "forbidden" : "error");
        }
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  if (state === "off") return null;

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(fr ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" });
  const open = (rows ?? []).filter((row) => row.status === "open");
  const now = Date.now();

  return (
    <section className="mt-8" data-ke="match-review-queue" aria-labelledby="match-review-title">
      <h2 id="match-review-title" className="font-display text-xl">
        {fr ? "Demandes de révision d’un jumelage" : "Match review requests"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Une personne a demandé qu’un humain revoie un jumelage d’emploi. Répondez depuis privacy@kidease.ca dans les 30 jours, puis marquez la demande comme répondue. Aucun courriel n’est envoyé d’ici."
          : "Someone asked a person to review a job match. Reply from privacy@kidease.ca within 30 days, then mark it answered. No email is sent from here."}
      </p>
      {state === "loading" ? <p className="mt-3 text-sm text-muted">{fr ? "Chargement…" : "Loading…"}</p> : null}
      {state === "forbidden" ? <p className="mt-3 text-sm text-danger" role="alert">{fr ? "Admin seulement." : "Admin only."}</p> : null}
      {state === "error" ? <p className="mt-3 text-sm text-danger" role="alert">{fr ? "Impossible de charger la liste." : "Could not load the list."}</p> : null}
      {state === "ready" ? (
        <>
          <p className="mt-3 text-sm font-semibold" role="status">
            {fr ? `${open.length} ouverte(s)` : `${open.length} open`}
          </p>
          {rows && rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{fr ? "Aucune demande." : "No requests."}</p>
          ) : null}
          <ul className="mt-3 space-y-3">
            {(rows ?? []).map((row) => {
              const overdue = row.status === "open" && new Date(row.dueBy).getTime() < now;
              return (
                <li key={row.id} className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
                  <p className="text-sm font-semibold">
                    {row.name || (fr ? "Sans nom" : "No name")}
                    {row.email ? (
                      <>
                        {" · "}
                        <a className="text-primary underline" href={`mailto:${row.email}`}>{row.email}</a>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {row.side === "provider" ? (fr ? "Garderie" : "Daycare") : fr ? "Personnel" : "Staff"}
                    {row.jobId ? ` · ${fr ? "Offre" : "Job"} ${row.jobId}` : ""}
                    {` · ${fr ? "Reçue" : "Received"} ${date(row.createdAt)}`}
                  </p>
                  {row.message ? <p className="mt-2 whitespace-pre-wrap text-sm">{row.message}</p> : null}
                  {row.status === "open" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className={`text-sm ${overdue ? "font-semibold text-danger" : "text-muted"}`}>
                        {overdue
                          ? fr ? `En retard depuis le ${date(row.dueBy)}` : `Overdue since ${date(row.dueBy)}`
                          : fr ? `Répondre d’ici le ${date(row.dueBy)}` : `Answer by ${date(row.dueBy)}`}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => {
                          setBusyId(row.id);
                          void markMatchReviewAnswered({ data: { id: row.id } })
                            .then(() => load())
                            .finally(() => setBusyId(""));
                        }}
                      >
                        {fr ? "Marquer comme répondue" : "Mark answered"}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      {fr ? "Répondue" : "Answered"}
                      {row.answeredAt ? ` · ${date(row.answeredAt)}` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
