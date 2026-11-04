import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { coparentCopy } from "@/lib/coparent-copy";
import { invitePath } from "@/lib/coparent";
import { parentDeskPath } from "@/lib/desk-nav";
import { custodyCopy } from "@/lib/custody-copy";
import { inviteCoparentByEmail } from "@/lib/server/coparent-email";
import {
  acceptCoparentInvite,
  createCoparentInvite,
  listCoparent,
  removeCoparent,
  setCoparentAccess,
} from "@/lib/server/coparent";
import { useCopy } from "@/lib/use-copy";
import { useRouterState } from "@tanstack/react-router";

type Desk = Awaited<ReturnType<typeof listCoparent>>;

function explain(err: unknown, errors: Record<string, string>, fallback: string) {
  const message = err instanceof Error ? err.message : "";
  const code = message.startsWith("coparent:") ? message.slice("coparent:".length) : "";
  return errors[code] || fallback;
}

export function CoparentDesk({ inviteToken = null }: { inviteToken?: string | null }) {
  const { locale } = useCopy();
  const copy = coparentCopy(locale);
  const emailCopy = custodyCopy(locale);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const deskPath = parentDeskPath(pathname);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [access, setAccess] = useState<"full" | "view">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  function load() {
    void listCoparent()
      .then((row) => {
        setDesk(row);
        if (row.accessChoice === "full" || row.accessChoice === "view") setAccess(row.accessChoice);
      })
      .catch(() => setDesk(null));
  }

  useEffect(() => {
    load();
  }, []);

  if (!desk) return <p className="text-sm text-muted">{copy.lead}</p>;
  if (!desk.enabled) {
    return <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo={deskPath} />;
  }

  const link = desk.inviteToken ? invitePath(desk.inviteToken, deskPath) : "";
  const showJoin = Boolean(inviteToken) && desk.role !== "owner" && desk.role !== "member";

  return (
    <section className="mt-6 space-y-6">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>
        <p className="mt-2 text-sm">{copy.shared}</p>
        <p className="mt-2 text-sm text-muted">{desk.emailEnabled ? emailCopy.lead : copy.noSend}</p>
      </div>
      {desk.role === "member" && desk.access === "view" ? (
        <p className="rounded-xl bg-surface p-4 text-sm ring-1 ring-border" role="status">
          {copy.youLook}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {showJoin ? (
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void acceptCoparentInvite({ data: { token: inviteToken || "" } })
              .then(() => {
                toast.success(copy.saved);
                load();
              })
              .catch((err) => setError(explain(err, copy.errors, copy.bad)))
              .finally(() => setBusy(false));
          }}
        >
          {copy.join}
        </Button>
      ) : null}

      {desk.role === "member" ? (
        <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
          <p className="text-sm text-muted">{copy.mainParent}</p>
          <p className="mt-1 font-medium">{desk.ownerName || copy.otherParent}</p>
          <p className="mt-2 text-sm">{desk.access === "full" ? copy.full : copy.view}</p>
          <Button asChild className="mt-4" variant="secondary">
            <Link to={deskPath} search={{ tab: "children" }}>
              {copy.seeChildren}
            </Link>
          </Button>
        </div>
      ) : null}

      {desk.emailEnabled && desk.role === "none" && !showJoin ? (
        <form
          className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            void inviteCoparentByEmail({ data: { email, access, deskPath } })
              .then((row) => {
                toast.success(row.mailed ? emailCopy.sent : emailCopy.preview);
                load();
              })
              .catch((err) => setError(explain(err, emailCopy.errors, emailCopy.bad)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm">
            {emailCopy.emailLabel}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
              className="ke-input mt-1 min-h-11 w-full"
            />
          </label>
          <p className="text-sm text-muted">{emailCopy.mustAccept}</p>
          <p className="text-sm text-muted">{emailCopy.expires}</p>
          <Button type="submit" disabled={busy}>
            {emailCopy.send}
          </Button>
        </form>
      ) : null}

      {desk.role === "none" && !showJoin && !desk.emailEnabled ? (
        <form
          className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            void createCoparentInvite({ data: { access, deskPath } })
              .then(() => {
                toast.success(copy.saved);
                load();
              })
              .catch((err) => setError(explain(err, copy.errors, copy.bad)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm">
            {copy.access}
            <select
              className="ke-input mt-1 min-h-11 w-full"
              value={access}
              onChange={(event) => setAccess(event.target.value === "full" ? "full" : "view")}
            >
              <option value="view">{copy.view}</option>
              <option value="full">{copy.full}</option>
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {copy.create}
          </Button>
        </form>
      ) : null}

      {desk.role === "owner" ? (
        <div className="space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border">
          <p className="text-sm">{desk.status === "active" ? copy.linked : copy.waiting}</p>
          {desk.memberName ? <p className="font-medium">{desk.memberName}</p> : null}
          {link ? (
            <p className="break-all text-sm">
              <span className="text-muted">{copy.noSend}</span>
              <span className="mt-1 block font-medium">{link}</span>
            </p>
          ) : null}
          <label className="block text-sm">
            {copy.access}
            <select
              className="ke-input mt-1 min-h-11 w-full"
              value={access}
              onChange={(event) => setAccess(event.target.value === "full" ? "full" : "view")}
            >
              <option value="view">{copy.view}</option>
              <option value="full">{copy.full}</option>
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {link ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  const full = `${window.location.origin}${link}`;
                  void navigator.clipboard.writeText(full).then(
                    () => toast.success(copy.copied),
                    () => setError(copy.bad),
                  );
                }}
              >
                {copy.copy}
              </Button>
            ) : (
              <Button asChild>
                <Link to={deskPath} search={{ tab: "children" }}>
                  {copy.seeChildren}
                </Link>
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void setCoparentAccess({ data: { access } })
                  .then(() => {
                    toast.success(copy.saved);
                    load();
                  })
                  .catch((err) => setError(explain(err, copy.errors, copy.bad)))
                  .finally(() => setBusy(false));
              }}
            >
              {copy.saveAccess}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void removeCoparent()
                  .then(() => {
                    toast.success(copy.removed);
                    load();
                  })
                  .catch((err) => setError(explain(err, copy.errors, copy.bad)))
                  .finally(() => setBusy(false));
              }}
            >
              {copy.remove}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
