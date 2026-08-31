import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DaycareCard } from "@/components/daycare-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ChildProfileForm } from "@/components/child-profile-form";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteAccount, getFamily, setRole } from "@/lib/server/family";
import { hasCareDetails } from "@/lib/child-profile";
import { useCopy } from "@/lib/use-copy";
import { signOut } from "@/lib/auth/client";
import { formatAgeLabel } from "@/lib/templates";
import { formatMonth, money } from "@/lib/utils";
import type { Booking, Child, DaycareCard as Card, Payment } from "@/lib/types";

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>) => {
    const tab = s.tab;
    if (tab === "saved" || tab === "enrolled" || tab === "profile") return { tab };
    return {};
  },
  component: AccountPage,
});

function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const search = Route.useSearch();
  const [tab, setTab] = useState<"saved" | "bookings" | "payments" | "children">(
    search.tab === "saved" ? "saved" : search.tab === "enrolled" ? "bookings" : "children",
  );
  const [saved, setSaved] = useState<Card[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [editing, setEditing] = useState<Child | null | "new">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const f = await getFamily();
    setSaved(f.saved);
    setBookings(f.bookings);
    setPayments(f.payments);
    setChildren(f.children);
  }

  useEffect(() => {
    if (!user) return;
    void load().catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (search.tab === "saved") setTab("saved");
    else if (search.tab === "enrolled") setTab("bookings");
    else if (search.tab === "profile") setTab("children");
  }, [search.tab]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const tabs = [
    ["children", t("children")],
    ["bookings", t("myRequests")],
    ["saved", t("saved")],
    ["payments", t("payments")],
  ] as const;

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-4xl py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">{t("dashboard")}</h1>
            <p className="text-muted">{user.displayName ?? user.primaryEmail}</p>
          </div>
          <Button variant="secondary" onClick={() => void setRole({ data: "provider" })}>
            {t("provider")}
          </Button>
        </div>
        <div className="mt-6 flex gap-1 overflow-x-auto">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={
                tab === k
                  ? "rounded-full bg-fg px-4 py-2 text-sm text-bg"
                  : "rounded-full px-4 py-2 text-sm text-muted ring-1 ring-border"
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "saved" ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {saved.length ? saved.map((item) => <DaycareCard key={item.id} item={item} showDistance={false} />) : (
              <p className="text-muted">{t("noSaved")}</p>
            )}
          </div>
        ) : null}

        {tab === "bookings" ? (
          <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
            {bookings.length === 0 ? (
              <li className="p-8 text-center text-muted">{t("noRequests")}</li>
            ) : (
              bookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/daycare/$slug" params={{ slug: b.daycareSlug }} className="font-medium hover:underline">
                        {b.daycareName}
                      </Link>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-sm text-muted">
                      {b.childName ? `${b.childName} · ` : ""}
                      {b.startDate ?? formatMonth(b.startMonth, locale)} · {t(b.ageGroup)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.conversationId ? (
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/inbox/$id" params={{ id: b.conversationId }}>
                          {t("openChat")}
                        </Link>
                      </Button>
                    ) : null}
                    {b.status === "accepted" && b.paymentStatus !== "paid" ? (
                      <Button size="sm" asChild>
                        <Link to="/pay/$bookingId" params={{ bookingId: b.id }}>
                          {t("pay")}
                        </Link>
                      </Button>
                    ) : null}
                    {b.paymentStatus === "paid" || b.status === "active" ? (
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/pay/$bookingId" params={{ bookingId: b.id }}>
                          {t("viewReceipt")}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {tab === "payments" ? (
          <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
            {payments.length === 0 ? (
              <li className="p-8 text-center text-muted">{t("noPayments")}</li>
            ) : (
              payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-medium">{p.daycareName}</p>
                    <p className="text-muted">
                      {t(p.method)} · {p.status === "paid" ? t("paid") : t("pending")}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <span className="tabular-nums">{money(p.amount, locale)}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {tab === "children" ? (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="font-display text-2xl">{t("childProfileTitle")}</h2>
              <p className="mt-1 text-sm text-muted">{t("childProfileLead")}</p>
            </div>
            {editing ? (
              <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
                <ChildProfileForm
                  initial={editing === "new" ? null : editing}
                  onSaved={() => {
                    setEditing(null);
                    void load();
                  }}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
                  {children.length === 0 ? (
                    <li className="p-8 text-center text-muted">{t("noChildren")}</li>
                  ) : (
                    children.map((c) => (
                      <li key={c.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {c.name}
                              {c.preferredName ? <span className="text-muted"> ({c.preferredName})</span> : null}
                            </p>
                            <p className="text-sm text-muted">
                              {formatAgeLabel(c.birthdate, locale)} · {c.birthdate}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {c.epiPen ? (
                                <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger ring-1 ring-danger/20">
                                  {t("epiPenBadge")}
                                </span>
                              ) : null}
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                                {c.allergies || t("noAllergies")}
                              </span>
                              {hasCareDetails(c) ? (
                                <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok">
                                  {t("sharedWithCentre")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                            {t("editChild")}
                          </Button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
                <Button onClick={() => setEditing("new")}>{children.length ? t("newChild") : t("addChild")}</Button>
              </>
            )}
          </div>
        ) : null}

        <section className="mt-14 rounded-xl bg-surface p-5 ring-1 ring-border">
          <h2 className="font-display text-xl">{t("deleteAccount")}</h2>
          <p className="mt-2 text-sm text-muted">{t("deleteAccountLead")}</p>
          {confirmDelete ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={deleting}
                onClick={() => {
                  setDeleting(true);
                  void deleteAccount()
                    .then(() => signOut("/"))
                    .catch(() => setDeleting(false));
                }}
              >
                {t("deleteAccountConfirm")}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                {t("back")}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="mt-4 text-danger" onClick={() => setConfirmDelete(true)}>
              {t("deleteAccount")}
            </Button>
          )}
        </section>
      </main>
    </Shell>
  );
}
