import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { DESK_LABEL, DESK_PATH, deskQueryValue, parseDeskQuery, type DeskKey } from "@/lib/desks";
import { parentNavSearch, providerNavSearch } from "@/lib/desk-nav";
import { useSessionDesks } from "@/components/session-desks";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { compressProfileFile, writeProfilePhoto } from "@/lib/profile-photo";
import { authClient } from "@/lib/auth/client";
import { getMyContact, saveMyContact } from "@/lib/server/profile-contact";
import { CaslConsentFields } from "@/components/casl-consent-fields";
import { getMyCaslConsents, saveMyCaslConsents } from "@/lib/server/casl-consent-api";
import type { CaslPrefs } from "@/lib/casl";
import { PlaceSearch } from "@/components/place-search";
import { getMySearchAnchors, saveMySearchAnchors } from "@/lib/server/search-anchors";
import { useAppStore } from "@/lib/store";
import { RateKidEasePrompt } from "@/components/rate-kidease";
import { AppearanceControl } from "@/components/appearance-control";

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: {
      tab?: "saved" | "enrolled" | "profile" | "payments";
      desk?: "parent" | "director" | "admin" | "support";
    } = {};
    const tab = s.tab;
    if (tab === "saved" || tab === "enrolled" || tab === "profile" || tab === "payments") out.tab = tab;
    const desk = parseDeskQuery(typeof s.desk === "string" ? s.desk : "");
    if (desk) out.desk = deskQueryValue(desk);
    return out;
  },
  component: AccountPage,
});

function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const search = Route.useSearch();

  if (isPending) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }

  if (search.tab === "saved" || search.tab === "enrolled" || search.tab === "payments") {
    if (user) {
      return <Navigate to="/parent" search={{ tab: search.tab }} />;
    }
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-lg py-12 text-center">
          <h1 className="font-display text-3xl">{search.tab === "enrolled" ? t("enrolled") : t("saved")}</h1>
          <p className="mt-3 text-muted">{t("accountSettingsGuest")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link
                to="/login"
                search={parentLoginSearch(
                  search.tab === "enrolled" ? "/parent?tab=enrolled" : "/parent?tab=saved",
                )}
              >
                {t("parentSignIn")}
              </Link>
            </Button>
            <Button size="lg" variant="secondary" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link to="/search">{t("heroCta")}</Link>
            </Button>
          </div>
        </main>
      </Shell>
    );
  }

  return <ProfilePane />;
}

function AccountDeskFrame({ desk, children }: { desk: DeskKey | null; children: ReactNode }) {
  const navigate = useNavigate();
  if (desk === "provider") {
    return (
      <DeskShell
        desk="daycare"
        active="account"
        onSelect={(id) => {
          if (id === "account") return;
          void navigate({ to: "/provider", search: providerNavSearch(id) });
        }}
      >
        {children}
      </DeskShell>
    );
  }
  if (desk === "parent") {
    return (
      <DeskShell
        desk="parent"
        active="account"
        onSelect={(id) => {
          if (id === "account") return;
          void navigate({ to: "/parent", search: parentNavSearch(id) });
        }}
      >
        {children}
      </DeskShell>
    );
  }
  if (desk === "admin") {
    return (
      <DeskShell
        desk="admin"
        active="account"
        onSelect={(id) => {
          if (id === "account") return;
          void navigate({ to: "/admin" });
        }}
      >
        {children}
      </DeskShell>
    );
  }
  if (desk === "support") {
    return (
      <DeskShell
        desk="support"
        active="account"
        onSelect={(id) => {
          if (id === "account") return;
          void navigate({ to: "/support" });
        }}
      >
        {children}
      </DeskShell>
    );
  }
  return <Shell>{children}</Shell>;
}

function ProfilePane() {
  const { user } = useCurrentUserState();
  const { t, locale } = useCopy();
  const search = Route.useSearch();
  const { sticky } = useSessionDesks();
  const desk = parseDeskQuery(search.desk) ?? sticky;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.primaryEmail ?? "");
  const [bio, setBio] = useState("");
  const [consents, setConsents] = useState<CaslPrefs>({
    smsService: false,
    emailService: false,
    emailCommercial: false,
  });
  const origin = useAppStore((s) => s.origin);
  const workOrigin = useAppStore((s) => s.workOrigin);
  const setWorkOrigin = useAppStore((s) => s.setWorkOrigin);
  const anchorMode = useAppStore((s) => s.anchorMode);
  const setAnchorMode = useAppStore((s) => s.setAnchorMode);
  const [workQuery, setWorkQuery] = useState(workOrigin?.label ?? "");

  useEffect(() => {
    if (!user) return;
    setName(user.displayName ?? "");
    setEmail(user.primaryEmail ?? "");
    void getMyContact()
      .then((row) => {
        setName(row.name || user.displayName || "");
        setPhone(row.phone);
        setEmail(row.email || user.primaryEmail || "");
        setBio(row.bio);
      })
      .catch(() => {
        /* keep session name/email */
      });
    void getMyCaslConsents()
      .then((row) => {
        setConsents({
          smsService: row.smsService,
          emailService: row.emailService,
          emailCommercial: row.emailCommercial,
        });
      })
      .catch(() => undefined);
    void getMySearchAnchors()
      .then((saved) => {
        if (saved.work) {
          setWorkOrigin(saved.work);
          setWorkQuery(saved.work.label);
        }
        if (saved.mode) setAnchorMode(saved.mode);
      })
      .catch(() => undefined);
  }, [user?.id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveMyContact({ data: { name, phone, bio } });
      setName(saved.name);
      setPhone(saved.phone);
      setEmail(saved.email || email);
      setBio(saved.bio);
      const nextConsent = await saveMyCaslConsents({
        data: {
          ...consents,
          phone,
          email: saved.email || email,
          locale,
          method: "profile_checkbox",
        },
      });
      setConsents(nextConsent);
      if (saved.name) {
        try {
          await authClient.updateUser({ name: saved.name });
        } catch {
          /* profiles row is the source of truth */
        }
      }
      toast.success("Contact details saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save details");
    } finally {
      setSaving(false);
    }
  }

  const backCopy =
    desk === "provider"
      ? t("accountBackDaycare")
      : desk === "admin"
        ? t("accountBackAdmin")
        : desk === "support"
          ? t("accountBackSupport")
          : desk === "parent"
            ? t("accountBackParent")
            : null;

  return (
    <AccountDeskFrame desk={desk}>
      <main className={desk ? "max-w-lg pb-6" : "ke-gutter mx-auto max-w-lg pb-10 pt-6"}>
        {desk ? (
          <Link to={DESK_PATH[desk]} className="mb-3 inline-block text-sm font-medium text-primary">
            {backCopy}
          </Link>
        ) : null}
        {desk ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">
            {DESK_LABEL[desk]} · {t("account")}
          </p>
        ) : null}
        <h1 className="font-display text-[1.75rem] tracking-[-0.03em]">{t("profile")}</h1>
        <section className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
          <AppearanceControl />
        </section>
        <div className="mt-8 flex flex-col items-center text-center">
          <ProfileAvatar userId={user?.id} fallback={user?.profileImageUrl} name={name || user?.displayName} size="lg" />
          <p className="mt-4 text-lg font-semibold">{name || user?.displayName || t("profile")}</p>
          {email || user?.primaryEmail ? (
            <p className="mt-1 text-sm text-muted">{email || user?.primaryEmail}</p>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!user) return;
              setBusy(true);
              void compressProfileFile(file)
                .then(async (dataUrl) => {
                  writeProfilePhoto(user.id, dataUrl);
                  try {
                    await authClient.updateUser({ image: dataUrl });
                  } catch {
                    /* local photo still shows */
                  }
                  toast.success("Profile photo updated");
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : "Could not add photo"))
                .finally(() => setBusy(false));
            }}
          />
          {user ? (
            <Button className="mt-6" size="lg" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? t("loading") : "Add or change photo"}
            </Button>
          ) : (
            <Button className="mt-6" size="lg" asChild>
              <Link to="/login" search={parentLoginSearch("/account?tab=profile")}>
                Sign in to add a photo
              </Link>
            </Button>
          )}
        </div>

        {user ? (
          <form onSubmit={onSave} className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <h2 className="font-display text-lg tracking-[-0.02em]">Contact details</h2>
            <p className="text-[13px] text-muted">Shown on Parent, Daycare, and Admin — this is your KidEase account.</p>
            <label className="block text-sm">
              Name
              <input className="ke-input mt-1" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </label>
            <label className="block text-sm">
              Phone number
              <input className="ke-input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" maxLength={32} placeholder="204-555-0100" />
            </label>
            <label className="block text-sm">
              Email
              <input className="ke-input mt-1 bg-bg" value={email} readOnly autoComplete="email" />
            </label>
            <p className="text-[12px] text-subtle">Email is the address you sign in with. Use Forgot password on the sign-in page to recover it.</p>
            <label className="block text-sm">
              Bio
              <textarea
                className="ke-input mt-1 min-h-24 resize-y"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={400}
                placeholder="A short note about you or your family."
              />
            </label>
            <p className="text-right text-[12px] text-subtle">{bio.length}/400</p>
            <CaslConsentFields value={consents} onChange={setConsents} />
            <div className="pt-2">
              <p className="text-sm font-medium">{t("anchorWorkLabel")}</p>
              <p className="mt-1 text-[13px] text-muted">{t("anchorNeedWork")}</p>
              <PlaceSearch
                value={workQuery}
                onChange={setWorkQuery}
                onResolved={(place) => {
                  setWorkOrigin(place);
                  setWorkQuery(place.label);
                  if (anchorMode === "home") setAnchorMode("both");
                  void saveMySearchAnchors({
                    data: { home: origin, work: place, mode: anchorMode === "home" ? "both" : anchorMode },
                  }).catch(() => undefined);
                }}
                placeholder={t("anchorWorkPh")}
                origin={origin}
                inputClassName="ke-input mt-2 w-full"
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? t("loading") : "Save details"}
            </Button>
          </form>
        ) : (
          <p className="mt-8 text-center text-sm text-muted">{t("accountSettingsGuest")}</p>
        )}
        <RateKidEasePrompt className="mt-8" />
      </main>
    </AccountDeskFrame>
  );
}
