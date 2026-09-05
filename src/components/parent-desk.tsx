import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { EmptyState } from "@/components/empty-state";
import { DaycareCard } from "@/components/daycare-card";
import { StatusBadge } from "@/components/status-badge";
import { ListingStatusBadge, LedgerHonesty } from "@/components/listing-status-badge";
import { Button } from "@/components/ui/button";
import { ChildProfileForm } from "@/components/child-profile-form";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteAccount, getFamily } from "@/lib/server/family";
import { shareChildWithCentres } from "@/lib/server/enrol-queue";
import { hasCareDetails } from "@/lib/child-profile";
import { useCopy } from "@/lib/use-copy";
import { signOut } from "@/lib/auth/client";
import { formatAgeLabel } from "@/lib/templates";
import { formatMonth, money } from "@/lib/utils";
import { useSessionDesks } from "@/components/desk-switcher";
import type { Booking, Child, DaycareCard as Card, Payment } from "@/lib/types";

type ParentTab = "home" | "saved" | "bookings" | "payments" | "children";

export function ParentDesk({ initialTab }: { initialTab?: ParentTab }) {
  const { user } = useCurrentUserState();
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const { session: desks } = useSessionDesks();
  const [tab, setTab] = useState<ParentTab>(initialTab ?? "home");

  function selectTab(id: string) {
    const next = (id === "add" ? "home" : id) as ParentTab;
    setTab(next);
    const search =
      next === "home"
        ? {}
        : next === "bookings"
          ? { tab: "enrolled" as const }
          : { tab: next };
    void navigate({ to: "/parent", search });
  }
  const [saved, setSaved] = useState<Card[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [editing, setEditing] = useState<Child | null | "new">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});

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
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  if (!user) return null;

  return (
    <DeskShell desk="parent" active={tab} onSelect={selectTab}>
      <p className="text-muted">{user.displayName ?? user.primaryEmail}</p>

      {tab === "home" ? (
        <section className="mt-6 space-y-4">
          <div>
            <h2 className="font-display text-2xl">{t("deskHomeTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("deskHomeLead")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <HomeCard title={t("search")} body={t("deskHomeSearch")} href="/search" />
            <HomeCard title={t("saved")} body={`${saved.length} · ${t("deskHomeSaved")}`} onClick={() => selectTab("saved")} />
            <HomeCard title={t("bookings")} body={`${bookings.length} · ${t("deskHomeBookings")}`} onClick={() => selectTab("bookings")} />
            <HomeCard title={t("inbox")} body={t("deskHomeInbox")} href="/inbox" />
          </div>
        </section>
      ) : null}

      {tab === "saved" ? (
        <div className="ke-listings mt-6">
          {saved.length ? (
            saved.map((item) => (
              <div key={item.id} className="space-y-2">
                {item.live || (item.claimStatus && item.claimStatus !== "unclaimed") ? (
                  <ListingStatusBadge claimStatus={item.claimStatus} live={item.live} />
                ) : null}
                <DaycareCard item={item} showDistance={false} />
              </div>
            ))
          ) : (
            <EmptyState title={t("noSaved")} body={t("noSavedLead")} action={t("emptyFindCare")} actionTo="/search" />
          )}
        </div>
      ) : null}

      {tab === "bookings" ? (
        <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {bookings.length === 0 ? (
            <li className="p-2">
              <EmptyState title={t("noRequests")} body={t("deskHomeBookings")} action={t("emptyFindCare")} actionTo="/search" />
            </li>
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
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "payments" ? (
        <div className="mt-6">
          <LedgerHonesty stripeLive={Boolean(desks?.stripeLive)} className="mb-3" />
          <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
            {payments.length === 0 ? (
              <li className="p-2">
                <EmptyState title={t("noPayments")} body={t("noPaymentsLead")} action={t("bookings")} onAction={() => selectTab("bookings")} />
              </li>
            ) : (
              payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-medium">{p.daycareName}</p>
                    <p className="text-muted">
                      {p.method} · {p.status === "paid" ? t("paid") : t("pending")}
                    </p>
                  </div>
                  <span className="tabular-nums">{money(p.amount, locale)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {tab === "children" ? (
        <div className="mt-6 space-y-4">
          <div>
            <h2 className="font-display text-2xl">{t("childProfileTitle")}</h2>
            <p className="mt-1 text-sm text-muted">
              Save the child profile, then send it to saved centres. Each centre sees it in Incoming requests and can approve, wait, or decline.
            </p>
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
                  <li className="p-2">
                    <EmptyState title={t("noChildren")} body={t("noChildrenLead")} action={t("emptyAddChild")} onAction={() => setEditing("new")} />
                  </li>
                ) : (
                  children.map((c) => {
                    const selected = picked[c.id] ?? [];
                    return (
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
                      <div className="mt-4 rounded-lg bg-bg p-3 ring-1 ring-border">
                        <p className="text-sm font-medium">Send this profile to a centre</p>
                        {saved.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">
                            Save centres from search first, or open a listing and tap Request a spot.
                            <Link to="/search" className="ml-1 underline">
                              Find care
                            </Link>
                          </p>
                        ) : (
                          <>
                            <ul className="mt-2 space-y-1.5">
                              {saved.map((d) => {
                                const on = selected.includes(d.id);
                                return (
                                  <li key={d.id}>
                                    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        className="size-4 accent-primary"
                                        checked={on}
                                        onChange={() =>
                                          setPicked((cur) => {
                                            const next = new Set(cur[c.id] ?? []);
                                            if (on) next.delete(d.id);
                                            else next.add(d.id);
                                            return { ...cur, [c.id]: [...next] };
                                          })
                                        }
                                      />
                                      <span>{d.name}</span>
                                      <span className="text-subtle">{d.city}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                            <Button
                              className="mt-3"
                              size="sm"
                              disabled={!selected.length || sendingId === c.id}
                              onClick={() => {
                                setSendingId(c.id);
                                void shareChildWithCentres({ data: { childId: c.id, daycareIds: selected } })
                                  .then((res) => {
                                    toast.success(`Sent ${res.childName} to ${res.sent.length} centre${res.sent.length === 1 ? "" : "s"}.`);
                                    selectTab("bookings");
                                    return load();
                                  })
                                  .catch((err) => toast.error(err instanceof Error ? err.message : "Could not send"))
                                  .finally(() => setSendingId(null));
                              }}
                            >
                              {sendingId === c.id ? "Sending…" : "Send to selected centres"}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                    );
                  })
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
    </DeskShell>
  );
}

function HomeCard({
  title,
  body,
  href,
  onClick,
}: {
  title: string;
  body: string;
  href?: "/search" | "/inbox";
  onClick?: () => void;
}) {
  const className = "block rounded-xl bg-surface p-4 text-left ring-1 ring-border hover:ring-fg";
  if (href) {
    return (
      <Link to={href} className={className}>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </button>
  );
}
