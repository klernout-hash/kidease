import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AttendanceSamples } from "@/components/child-checkin-desk";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { attendanceCopy, attendancePreviewEnabled } from "@/lib/attendance-handoff";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { attendancePreviewOpen, seedDemoAttendance } from "@/lib/server/child-checkin";

export const Route = createFileRoute("/preview/attendance")({
  validateSearch: (search: Record<string, unknown>) => ({
    look: search.look === "dark" ? ("dark" as const) : ("light" as const),
    lang: search.lang === "fr" ? ("fr" as const) : ("en" as const),
  }),
  loader: () => ({ open: attendancePreviewEnabled() }),
  head: () => ({
    meta: [
      { title: "Attendance preview · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AttendancePreviewPage,
});

function AttendancePreviewPage() {
  const { look, lang } = Route.useSearch();
  const loaded = Route.useLoaderData();
  const copy = attendanceCopy(lang);
  const { user, isPending } = useCurrentUserState();
  const [open, setOpen] = useState<boolean | null>(loaded.open);
  const [note, setNote] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-resolved-theme", look);
    document.documentElement.setAttribute("lang", lang);
  }, [look, lang]);

  useEffect(() => {
    void attendancePreviewOpen()
      .then((row) => setOpen(row.open))
      .catch(() => setOpen(loaded.open));
  }, []);

  return (
    <Shell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6" data-ke="attendance-preview">
        <p className="text-sm text-muted">KidEase</p>
        <h1 className="mt-1 font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-tight">{copy.title}</h1>
        {open === false ? (
          <p className="mt-4 max-w-prose text-base leading-7">{copy.closed}</p>
        ) : null}
        {open ? (
          <>
            <AttendanceSamples locale={lang} />
            <section className="mt-8 rounded-2xl bg-surface p-4 ring-1 ring-border">
              <h2 className="text-lg font-semibold">{copy.add}</h2>
              {isPending ? null : user ? (
                <Button
                  type="button"
                  className="mt-3 min-h-11"
                  data-ke="attendance-seed"
                  onClick={() => {
                    void seedDemoAttendance()
                      .then((result) => setNote(result.ok ? copy.added : result.error))
                      .catch(() => setNote(copy.closed));
                  }}
                >
                  {copy.add}
                </Button>
              ) : (
                <Link
                  to="/login"
                  search={parentLoginSearch("/preview/attendance")}
                  className="mt-3 inline-flex min-h-11 items-center font-medium text-primary"
                >
                  {copy.signIn}
                </Link>
              )}
              {note ? (
                <p className="mt-3 text-sm" role="status">
                  {note}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col items-start gap-1">
                <Link to="/provider" search={{ desk: "today" }} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
                  {copy.staffLink}
                </Link>
                <Link to="/account" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
                  {copy.parentLink}
                </Link>
              </div>
            </section>
          </>
        ) : null}
        <p className="mt-6">
          <Link to="/" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
