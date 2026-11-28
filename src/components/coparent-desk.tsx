import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { coparentCopy } from "@/lib/coparent-copy";
import { inviteShareUrl } from "@/lib/coparent";
import { shouldOfferWebShare } from "@/lib/native";
import { copyText, shareOrCopy } from "@/lib/share";
import { parentDeskPath } from "@/lib/desk-nav";
import { custodyCopy } from "@/lib/custody-copy";
import { inviteShortlistShare } from "@/lib/server/parent-tracker";
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

export function CoparentDesk({ inviteToken = null, shortlistShared = false }: { inviteToken?: string | null; shortlistShared?: boolean }) {
  const { locale, t } = useCopy();
  const copy = coparentCopy(locale);
  const emailCopy = custodyCopy(locale);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fromSaved = useRouterState({ select: (s) => s.location.hash === "invite-partner" });
  const deskPath = parentDeskPath(pathname);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [access, setAccess] = useState<"full" | "view">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [heldPath, setHeldPath] = useState("");
  const [inviteKind, setInviteKind] = useState<"family" | "saved">(fromSaved ? "saved" : "family");

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

  const link = desk.inviteToken
    ? inviteShareUrl(desk.inviteToken, deskPath, typeof window === "undefined" ? undefined : window.location.origin)
    : "";
  const showJoin = Boolean(inviteToken) && desk.role !== "owner" && desk.role !== "member";

  const canInviteFamily = desk.enabled && desk.role === "none" && !showJoin;
  const canInviteSaved = !shortlistShared && !showJoin;
  const showSavedInvite = canInviteSaved && (!canInviteFamily || inviteKind === "saved");

  return (
    <section className="mt-6 space-y-6">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>
        {desk.enabled ? <p className="mt-2 text-sm">{copy.shared}</p> : null}
        {desk.enabled && !link ? <p className="mt-2 text-sm text-muted">{desk.emailEnabled ? emailCopy.lead : copy.noSend}</p> : null}
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

      {!desk.enabled ? (
        <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo={deskPath} />
      ) : null}

      {canInviteFamily || canInviteSaved ? (
        <section id="invite-partner" className="scroll-mt-24 space-y-3" aria-labelledby="invite-partner-title">
          <h3 id="invite-partner-title" className="text-lg font-semibold">{t("shareShortlist")}</h3>
          {canInviteFamily && canInviteSaved ? (
            <label className="block text-sm">
              {locale === "fr" ? "Que voulez-vous partager?" : "What would you like to share?"}
              <select
                className="ke-input mt-1 min-h-11 w-full"
                value={inviteKind}
                onChange={(event) => setInviteKind(event.target.value === "saved" ? "saved" : "family")}
              >
                <option value="family">{copy.title}</option>
                <option value="saved">{locale === "fr" ? "Garderies enregistrées seulement" : "Saved daycares only"}</option>
              </select>
            </label>
          ) : null}
          {showSavedInvite ? (
            <form
              className="mt-3 w-full space-y-2"
              data-ke="shortlist-share"
              onSubmit={(event) => {
                event.preventDefault();
                setInviteError("");
                setHeldPath("");
                setInviteBusy(true);
                void inviteShortlistShare({ data: { email: inviteEmail } })
                  .then((result) => {
                    if (!result.ok) {
                      const key =
                        result.reason === "self"
                          ? "shareShortlistSelf"
                          : result.reason === "limit"
                            ? "shareShortlistLimit"
                            : "shareShortlistEmailBad";
                      setInviteError(t(key));
                      return;
                    }
                    setInviteEmail("");
                    if (result.emailed) {
                      toast.success(t("shareShortlistSent"));
                      return;
                    }
                    setHeldPath(result.path);
                    toast.message(t("shareShortlistHeld"));
                  })
                  .catch(() => setInviteError(t("shareShortlistBad")))
                  .finally(() => setInviteBusy(false));
              }}
            >
              <label className="block text-sm" htmlFor="shortlist-partner-email">
                {t("shareShortlistEmail")}
              </label>
              <p className="text-sm text-muted">{t("shareShortlistLead")}</p>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="shortlist-partner-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
                  className="h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-base"
                />
                <Button type="submit" disabled={inviteBusy}>
                  {t("shareShortlistSend")}
                </Button>
              </div>
              {inviteError ? (
                <p role="alert" className="text-sm text-danger">
                  {inviteError}
                </p>
            ) : null}
              {heldPath ? (
                <p className="break-all text-sm text-fg" data-ke="share-link">
                  {heldPath}
                </p>
            ) : null}
            </form>
          ) : null}
        {canInviteFamily && !showSavedInvite && desk.emailEnabled ? (
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
            <Button type="submit" disabled={busy}>
              {emailCopy.send}
            </Button>
          </form>
        ) : null}

        {canInviteFamily && !showSavedInvite && !desk.emailEnabled ? (
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

        </section>
      ) : null}

      {desk.role === "owner" ? (
        <div className="space-y-4 rounded-xl bg-surface p-4 ring-1 ring-border">
          <p className="text-sm">{desk.status === "active" ? copy.linked : copy.waiting}</p>
          {desk.memberName ? <p className="font-medium">{desk.memberName}</p> : null}
          {link ? (
            <p className="break-all text-sm">
              <span className="text-muted">{desk.emailEnabled ? copy.linkEmailed : copy.noSend}</span>
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
              <>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    void copyText(link).then((copied) => {
                      if (copied) toast.success(copy.copied);
                      else setError(copy.bad);
                    });
                  }}
                >
                  {copy.copy}
                </Button>
                {shouldOfferWebShare({ title: copy.title, url: link }) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      void shareOrCopy({ title: copy.title, text: "", url: link }).then((outcome) => {
                        if (outcome === "copied") toast.success(copy.copied);
                        else if (outcome === "failed") setError(copy.bad);
                      });
                    }}
                  >
                    {copy.share}
                  </Button>
                ) : null}
              </>
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
