import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { inviteGovUser, listGovMembers, revokeGovInvite, revokeGovUser } from "@/lib/server/gov-admin";

export const Route = createFileRoute("/admin/government")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listGovMembers(),
  head: () => ({
    meta: [
      { title: "Government users · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GovAdminPage,
});

function GovAdminPage() {
  const page = Route.useLoaderData();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [province, setProvince] = useState("MB");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function invite() {
    setBusy(true);
    setError("");
    setLink("");
    try {
      const result = await inviteGovUser({ data: { email, orgName, province } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.linked && result.path) setLink(result.path);
      setEmail("");
      setOrgName("");
      await router.invalidate();
    } catch {
      setError("Could not save that invite.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    setBusy(true);
    setError("");
    try {
      await revokeGovUser({ data: { userId } });
      await router.invalidate();
    } catch {
      setError("Could not revoke that account.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    setBusy(true);
    try {
      await revokeGovInvite({ data: { id } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl">Government users</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Invite a government account or revoke one. They only see aggregated counts. The public site, parent desk, and daycare desk stay unchanged.
        </p>
        <form
          className="mt-6 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void invite();
          }}
        >
          <label className="text-sm font-medium">
            Work email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3"
            />
          </label>
          <label className="text-sm font-medium">
            Organization
            <input
              required
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3"
            />
          </label>
          <label className="text-sm font-medium">
            Province
            <select
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3"
            >
              {page.provinces.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              Invite
            </Button>
          </div>
        </form>
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {link ? (
          <p className="mt-3 break-all text-sm">
            One-time link (copy it now): <span className="font-medium">{link}</span>
          </p>
        ) : null}
        <h2 className="mt-8 font-display text-xl">Accounts</h2>
        <ul className="mt-3 space-y-3">
          {page.members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 ring-1 ring-border">
              <div>
                <p className="font-medium">{member.orgName}</p>
                <p className="text-sm text-muted">
                  {member.email} · {member.province} · {member.status}
                  {member.demo ? " · demo" : ""}
                </p>
              </div>
              {member.status === "active" && !member.demo ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void revoke(member.userId)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <h2 className="mt-8 font-display text-xl">Open invites</h2>
        <ul className="mt-3 space-y-3">
          {page.invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 ring-1 ring-border">
              <p className="text-sm">
                {invite.email} · {invite.orgName} · {invite.province}
              </p>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void revokeInvite(invite.id)}>
                Revoke invite
              </Button>
            </li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}
