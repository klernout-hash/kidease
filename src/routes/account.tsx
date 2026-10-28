import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, Navigate, useLoaderData, useNavigate, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { privateReturnPath } from "@/lib/role-access";
import { toast } from "sonner";
import { confirmAction } from "@/lib/success-confirm";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { AdminDeskLink } from "@/components/admin-desk-link";
import { DESK_PATH, deskQueryValue, highlightDesk, openAdminDesk, parseDeskQuery, type DeskKey } from "@/lib/desks";
import { accountDeskPath, menuDeskPath, parentDeskPath, parentNavSearch, providerDeskPath, providerNavSearch, supportDeskPath } from "@/lib/desk-nav";
import { useSessionDesks } from "@/components/session-desks";
import { useRoleChrome } from "@/components/role-chrome";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { compressProfileFile, writeProfilePhoto } from "@/lib/profile-photo";
import { authClient } from "@/lib/auth/client";
import { getMyContact, saveMyContact } from "@/lib/server/profile-contact";
import { CaslConsentFields } from "@/components/casl-consent-fields";
import { FamilyVaultPanel } from "@/components/family-vault";
import { getMyCaslConsents, saveMyCaslConsents } from "@/lib/server/casl-consent-api";
import type { CaslPrefs } from "@/lib/casl";
import { PlaceSearch } from "@/components/place-search";
import { getMySearchAnchors, saveMySearchAnchors } from "@/lib/server/search-anchors";
import type { AnchorPoint } from "@/lib/dual-anchor";
import { useAppStore } from "@/lib/store";
import { AppearanceControl } from "@/components/appearance-control";
import { useInNativeShell } from "@/lib/use-native-shell";
import { SignedInDevices } from "@/components/signed-in-devices";
import { AccountSecurity } from "@/components/account-security";
import { DeleteAccountPanel } from "@/components/delete-account-panel";
import { AlertPushSettings } from "@/components/alert-push-settings";
import { ReferFriendPanel } from "@/components/refer-friend-panel";
import { fieldErrorClass, RequiredMark } from "@/components/required-field";
import { focusFirstInvalid } from "@/lib/profile-form";
import { ProfileFacts, ProfileHeroCard, type ProfileFact } from "@/components/profile-hero";
import { ProfileChildren } from "@/components/profile-children";
import { RoleSwitchPill } from "@/components/role-switch-pill";
import { ProfileDeskExtras } from "@/components/profile-public";
import { profileRoleId, showProfileStats, yearsOnKidEase } from "@/lib/profile-hero";
import { loadMenuProviderCards } from "@/lib/server/menu-summary";
import { listingHours, sharedNumber, sharedText } from "@/lib/profile-desk";
import { loadProfileDesk } from "@/lib/server/profile-desk";
import type { ProfileDesk } from "@/lib/server/profile-desk";
import { ParentWallet } from "@/components/parent-wallet";
import { connectPaymentsPublic } from "@/lib/server/connect-payments";

export function accountBeforeLoad({
  context,
  location,
}: {
  context: { roleChrome?: Parameters<typeof beforeLoadPrivate>[1] };
  location: Parameters<typeof privateReturnPath>[0];
}) {
  return beforeLoadPrivate(privateReturnPath(location), context.roleChrome);
}

export function accountLoader() {
  return connectPaymentsPublic();
}

export function accountHead({ match }: { match: { search: { desk?: string } } }) {
  return {
    meta: [
      { title: match.search.desk === "admin" ? "Admin account · KidEase" : "Account · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

export function accountValidateSearch(s: Record<string, unknown>) {
    const out: {
      tab?: "saved" | "enrolled" | "profile" | "payments";
      desk?: "parent" | "director" | "admin" | "support";
      section?: "profile" | "alerts" | "appearance" | "subscription" | "delete" | "security" | "email-sms" | "documents" | "refer" | "wallet";
      edit?: "1";
      field?: "name" | "phone" | "email" | "work" | "about";
    } = {};
    const tab = s.tab;
    if (tab === "saved" || tab === "enrolled" || tab === "profile" || tab === "payments") out.tab = tab;
    const section = s.section;
    if (
      section === "profile" ||
      section === "alerts" ||
      section === "appearance" ||
      section === "subscription" ||
      section === "delete" ||
      section === "security" ||
      section === "email-sms" ||
      section === "documents" ||
      section === "refer" ||
      section === "wallet"
    ) {
      out.section = section;
    }
    const desk = parseDeskQuery(typeof s.desk === "string" ? s.desk : "");
    if (desk) out.desk = deskQueryValue(desk);
    const editRaw = typeof s.edit === "string" ? s.edit.replace(/^"|"$/g, "") : s.edit;
    if (editRaw === "1" || editRaw === 1) out.edit = "1";
    if (s.field === "name" || s.field === "phone" || s.field === "email" || s.field === "work" || s.field === "about") {
      out.field = s.field;
    }
    return out;
}

type AccountSearch = ReturnType<typeof accountValidateSearch>;

export const Route = createFileRoute("/account")({
  beforeLoad: accountBeforeLoad,
  loader: accountLoader,
  head: accountHead,
  validateSearch: accountValidateSearch,
  component: AccountPage,
});

function useAccountSearch() {
  return useSearch({ strict: false }) as AccountSearch;
}

export function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  const chrome = useRoleChrome();
  const { t, locale } = useCopy();
  const search = useAccountSearch();
  // Role chrome is already in the server payload. Paint the account when that
  // role is known, so Face ID settings are in the first HTML instead of a
  // skeleton that waits on the client session.
  const sessionReady = !isPending || (chrome.signedIn && !chrome.pending);

  if (!sessionReady) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }

  if (search.tab === "saved" || search.tab === "enrolled" || search.tab === "payments") {
    if (user) {
      return <Navigate to={locale === "fr" ? "/fr/parent" : "/parent"} search={{ tab: search.tab }} />;
    }
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-lg py-12 text-center">
          <h1 className="font-display text-3xl">{search.tab === "enrolled" ? t("enrolled") : t("saved")}</h1>
          <p className="mt-3 text-muted">{t("accountSettingsGuest")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link
                to={locale === "fr" ? "/fr/login" : "/login"}
                search={parentLoginSearch(
                  locale === "fr"
                    ? search.tab === "enrolled"
                      ? "/fr/parent?tab=enrolled"
                      : "/fr/parent?tab=saved"
                    : search.tab === "enrolled"
                      ? "/parent?tab=enrolled"
                      : "/parent?tab=saved",
                )}
              >
                {t("parentSignIn")}
              </Link>
            </Button>
            <Button size="lg" variant="secondary" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link to={localePath("/search", locale)}>{t("heroCta")}</Link>
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (desk === "provider") {
    return (
      <DeskShell
        desk="daycare"
        active="account"
        onSelect={(id) => {
          if (id === "account") return;
          void navigate({ to: providerDeskPath(pathname), search: providerNavSearch(id) });
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
          void navigate({ to: parentDeskPath(pathname), search: parentNavSearch(id) });
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
          openAdminDesk();
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
          void navigate({ to: supportDeskPath(pathname) });
        }}
      >
        {children}
      </DeskShell>
    );
  }
  return <Shell>{children}</Shell>;
}

function ProfilePane() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const { refetch: refetchSession } = authClient.useSession();
  const nativeShell = useInNativeShell();
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accountTo = accountDeskPath(pathname);
  const search = useAccountSearch();
  const chrome = useRoleChrome();
  const canEditProfile = Boolean(user) || (chrome.signedIn && !chrome.pending);
  const { sticky } = useSessionDesks();
  const desk = parseDeskQuery(search.desk) ?? sticky;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.primaryEmail ?? "");
  const [bio, setBio] = useState("");
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [ratingX10, setRatingX10] = useState<number | null>(null);
  const [profileDesk, setProfileDesk] = useState<ProfileDesk | null>(null);
  const nameRef = useRef(user?.displayName ?? "");
  const phoneRef = useRef("");
  const bioRef = useRef("");
  const contactDirty = useRef({ name: false, phone: false, bio: false });
  const savedContact = useRef({ name: user?.displayName ?? "", phone: "", bio: "" });
  const savedConsents = useRef<CaslPrefs>({
    smsService: false,
    emailService: false,
    emailCommercial: false,
  });
  const [nameInvalid, setNameInvalid] = useState(false);
  const [editField, setEditField] = useState<"name" | "phone" | "email" | "work" | "about" | null>(null);
  const [gapTick, setGapTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const contactEpoch = useRef(0);
  const contactLoaded = useRef(false);
  const seenUserId = useRef<string | undefined>(undefined);
  const [consents, setConsents] = useState<CaslPrefs>({
    smsService: false,
    emailService: false,
    emailCommercial: false,
  });
  const [smsNote, setSmsNote] = useState("");
  const origin = useAppStore((s) => s.origin);
  const workOrigin = useAppStore((s) => s.workOrigin);
  const setWorkOrigin = useAppStore((s) => s.setWorkOrigin);
  const anchorMode = useAppStore((s) => s.anchorMode);
  const setAnchorMode = useAppStore((s) => s.setAnchorMode);
  const [workQuery, setWorkQuery] = useState(workOrigin?.label ?? "");
  const savedWorkLabel = useRef(workOrigin?.label ?? "");
  const [savedHome, setSavedHome] = useState<AnchorPoint | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    const switched = seenUserId.current !== undefined && seenUserId.current !== user.id;
    seenUserId.current = user.id;
    if (switched) {
      contactDirty.current = { name: false, phone: false, bio: false };
      setJoinedAt(null);
    }
    const epoch = ++contactEpoch.current;
    contactLoaded.current = false;
    if (!contactDirty.current.name) {
      const sessionName = user.displayName ?? "";
      nameRef.current = sessionName;
      setName(sessionName);
    }
    setEmail(user.primaryEmail ?? "");
    void getMyContact()
      .then((row) => {
        if (epoch !== contactEpoch.current) return;
        const dirty = contactDirty.current;
        const nextName = row.name || user.displayName || "";
        const nextPhone = row.phone;
        const nextBio = row.bio;
        savedContact.current = { name: nextName, phone: nextPhone, bio: nextBio };
        if (!dirty.name) {
          nameRef.current = nextName;
          setName(nextName);
        }
        if (!dirty.phone) {
          phoneRef.current = nextPhone;
          setPhone(nextPhone);
        }
        setEmail(row.email || user.primaryEmail || "");
        if (!dirty.bio) {
          bioRef.current = nextBio;
          setBio(nextBio);
        }
        setJoinedAt(row.joinedAt);
        contactLoaded.current = true;
      })
      .catch(() => {
        /* keep session name/email */
      });
    void getMyCaslConsents()
      .then((row) => {
        const next = {
          smsService: row.smsService,
          emailService: row.emailService,
          emailCommercial: row.emailCommercial,
        };
        savedConsents.current = next;
        setConsents(next);
      })
      .catch(() => undefined);
    void getMySearchAnchors()
      .then((saved) => {
        setSavedHome(saved.home);
        savedWorkLabel.current = saved.work?.label ?? "";
        if (saved.work) {
          setWorkOrigin(saved.work);
          setWorkQuery(saved.work.label);
        }
        if (saved.mode) setAnchorMode(saved.mode);
      })
      .catch(() => undefined);
  }, [user?.id]);

  async function onSave(e: React.FormEvent, leaveEdit = false) {
    e.preventDefault();
    if (!user) return;
    if (leaveEdit && !nameRef.current.trim()) {
      setEditField("name");
      setNameInvalid(true);
      setGapTick((n) => n + 1);
      return;
    }
    const typedWork = workQuery.trim();
    const resolvedWork = workOrigin && typedWork === workOrigin.label.trim() ? workOrigin : null;
    if (typedWork && !resolvedWork) {
      toast.error(t("anchorWorkMiss"));
      return;
    }
    contactEpoch.current += 1;
    if (!contactLoaded.current) {
      try {
        const row = await getMyContact();
        if (!contactDirty.current.name) {
          nameRef.current = row.name || user.displayName || "";
          setName(nameRef.current);
        }
        if (!contactDirty.current.phone) {
          phoneRef.current = row.phone;
          setPhone(row.phone);
        }
        if (!contactDirty.current.bio) {
          bioRef.current = row.bio;
          setBio(row.bio);
        }
        setEmail(row.email || user.primaryEmail || "");
        contactLoaded.current = true;
      } catch {
        /* save the fields already on screen */
      }
    }
    const nextName = nameRef.current;
    const nextPhone = phoneRef.current;
    const nextBio = bioRef.current.trim().slice(0, 400);
    setSaving(true);
    try {
      const saved = await saveMyContact({ data: { name: nextName, phone: nextPhone, bio: nextBio } });
      if (saved.bio !== nextBio) {
        toast.error(t("trackSaveFailed"));
        return;
      }
      nameRef.current = saved.name;
      phoneRef.current = saved.phone;
      bioRef.current = saved.bio;
      contactDirty.current = { name: false, phone: false, bio: false };
      setName(saved.name);
      setPhone(saved.phone);
      setEmail(saved.email || email);
      setBio(saved.bio);
      setJoinedAt(saved.joinedAt);
      const nextConsent = await saveMyCaslConsents({
        data: {
          ...consents,
          phone: saved.phone,
          email: saved.email || email,
          locale,
          method: "profile_checkbox",
        },
      });
      setConsents({
        smsService: nextConsent.smsService,
        emailService: nextConsent.emailService,
        emailCommercial: nextConsent.emailCommercial,
      });
      if (nextConsent.smsUnreachable) {
        setSmsNote(t("smsUnreachable"));
        toast.message(t("smsUnreachable"));
      } else {
        setSmsNote("");
      }
      // saveMyContact already writes "user".name. updateUser always rewrites
      // the session cookie, then the browser refetches get-session. On
      // www.kidease.ca that race looked signed out and /account left for
      // /login?intent=in&next=/account before the saved toast. Refresh the
      // header only when the name changed. That refetch does not mint a
      // cookie unless the session is already due for its normal refresh.
      const previousName = (user.displayName ?? "").trim();
      if (saved.name.trim() && saved.name.trim() !== previousName) {
        try {
          await refetchSession();
        } catch {
          /* profiles row is the source of truth */
        }
      }
      if (savedHome !== undefined && (resolvedWork || workOrigin)) {
        const mode = resolvedWork && anchorMode === "home" ? "both" : anchorMode;
        await saveMySearchAnchors({
          data: { home: savedHome, work: resolvedWork, mode },
        });
        savedWorkLabel.current = resolvedWork?.label ?? "";
      }
      confirmAction(t, "profileSaved");
      savedContact.current = { name: saved.name, phone: saved.phone, bio: saved.bio };
      savedConsents.current = {
        smsService: nextConsent.smsService,
        emailService: nextConsent.emailService,
        emailCommercial: nextConsent.emailCommercial,
      };
      if (leaveEdit) {
        setNameInvalid(false);
        void navigate({
          to: accountTo,
          search: {
            tab: "profile",
            ...(search.desk ? { desk: search.desk } : {}),
          },
          replace: true,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("accountSaveFailed"));
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

  const connect = useLoaderData({ strict: false }) as Awaited<ReturnType<typeof accountLoader>>;
  const hideUpgrade = desk === "admin" || chrome.subscriptionsEnabled !== true;
  const section =
    search.section === "wallet" && !connect.enabled
      ? "profile"
      : nativeShell && search.section === "subscription"
        ? "profile"
        : hideUpgrade && search.section === "subscription"
          ? "profile"
          : (search.section ?? "profile");
  const sectionSearch = (
    next: "profile" | "alerts" | "appearance" | "subscription" | "delete" | "security" | "email-sms" | "documents" | "refer" | "wallet",
  ) => ({
    tab: "profile" as const,
    ...(search.desk ? { desk: search.desk } : {}),
    section: next,
  });
  const sections = [
    { id: "profile" as const, label: t("profile") },
    { id: "alerts" as const, label: t("accountAlerts") },
    { id: "security" as const, label: t("loginSecurity") },
    { id: "wallet" as const, label: t("walletTitle") },
    { id: "email-sms" as const, label: t("emailAndSms") },
    { id: "documents" as const, label: t("familyDocs") },
    { id: "appearance" as const, label: t("appearance") },
    { id: "refer" as const, label: t("referFriend") },
    { id: "subscription" as const, label: t("navUpgrade") },
    { id: "delete" as const, label: t("deleteAccount") },
  ].filter((item) => {
    if (item.id === "wallet" && (!connect.enabled || !user)) return false;
    if (nativeShell && item.id === "subscription") return false;
    if (item.id === "subscription" && hideUpgrade) return false;
    return true;
  });
  const router = useRouter();
  const editing = search.edit === "1" && section === "profile";
  const french = locale === "fr";

  function profileFactRows(): ProfileFact[] {
    const rows: ProfileFact[] = [];
    const listings = profileDesk?.ok ? profileDesk.listings : [];
    if (daycareStats && listings.length) {
      const ages = sharedText(listings.map((listing) => listing.ages));
      const hours = sharedText(listings.map((listing) => listingHours(listing, french)));
      const languages = sharedText(listings.map((listing) => listing.languages));
      const spots = sharedNumber(listings.map((listing) => listing.spots));
      if (ages) rows.push({ id: "ages", label: t("agesAccepted"), value: french ? `${ages} mois` : `${ages} months` });
      if (hours) rows.push({ id: "hours", label: t("hours"), value: hours });
      if (languages) rows.push({ id: "languages", label: t("profileLanguages"), value: languages });
      if (spots != null) rows.push({ id: "spots", label: t("spotsAvailable"), value: String(spots) });
    }
    if (!daycareStats) {
      if (workQuery.trim()) rows.push({ id: "area", label: t("profileArea"), value: workQuery.trim() });
      const languages = profileDesk?.ok ? profileDesk.languages.join(", ") : "";
      if (languages) rows.push({ id: "languages", label: t("profileLanguages"), value: languages });
    }
    return rows;
  }
  const roleId = profileRoleId(chrome.role, highlightDesk("/account", sticky, desk));
  const daycareStats = showProfileStats(roleId);
  const homeSearch = {
    tab: "profile" as const,
    ...(search.desk ? { desk: search.desk } : {}),
  };
  const backTo = desk === "parent"
    ? parentDeskPath(pathname)
    : desk === "provider"
      ? providerDeskPath(pathname)
      : desk === "support"
        ? supportDeskPath(pathname)
        : desk
          ? DESK_PATH[desk]
          : menuDeskPath(pathname);

  const userId = user?.id;
  useEffect(() => {
    if (!daycareStats || !userId) {
      setReviewCount(null);
      setRatingX10(null);
      return;
    }
    setReviewCount(null);
    setRatingX10(null);
    let live = true;
    void loadMenuProviderCards()
      .then((cards) => {
        if (!live) return;
        setReviewCount(cards.reviewCount);
        setRatingX10(cards.ratingX10);
      })
      .catch(() => {
        if (!live) return;
        setReviewCount(null);
        setRatingX10(null);
      });
    return () => {
      live = false;
    };
  }, [daycareStats, userId]);

  useEffect(() => {
    if (!userId) {
      setProfileDesk(null);
      return;
    }
    let live = true;
    void loadProfileDesk()
      .then((desk) => {
        if (live) setProfileDesk(desk);
      })
      .catch(() => {
        if (live) setProfileDesk(null);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!gapTick) return;
    focusFirstInvalid(formRef.current);
  }, [gapTick]);

  function discardEdits() {
    const snap = savedContact.current;
    contactDirty.current = { name: false, phone: false, bio: false };
    nameRef.current = snap.name;
    phoneRef.current = snap.phone;
    bioRef.current = snap.bio;
    setName(snap.name);
    setPhone(snap.phone);
    setBio(snap.bio);
    setConsents(savedConsents.current);
    setWorkQuery(savedWorkLabel.current);
    setNameInvalid(false);
    setSmsNote("");
    void getMySearchAnchors()
      .then((saved) => {
        setSavedHome(saved.home);
        setWorkOrigin(saved.work);
        setWorkQuery(saved.work?.label ?? "");
        if (saved.mode) setAnchorMode(saved.mode);
      })
      .catch(() => undefined);
    void navigate({ to: accountTo, search: homeSearch, replace: true });
  }

  return (
    <AccountDeskFrame desk={desk}>
      <main className={desk ? "max-w-lg pb-6" : "ke-gutter mx-auto max-w-lg pb-10 pt-6"}>
        <div className="flex items-center justify-between gap-3">
          {editing && editField ? (
            <button
              type="button"
              aria-label={t("back")}
              data-ke="profile-field-back"
              onClick={() => setEditField(null)}
              className="grid size-11 place-items-center rounded-full text-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
          ) : editing ? (
            <span className="size-11" aria-hidden />
          ) : section !== "profile" ? (
            <Link
              to={accountTo}
              search={homeSearch}
              aria-label={t("back")}
              data-ke="profile-back"
              className="grid size-11 place-items-center rounded-full text-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </Link>
          ) : desk === "admin" ? (
            <AdminDeskLink
              className="grid size-11 place-items-center rounded-full text-fg touch-manipulation"
              aria-label={backCopy ?? t("back")}
              data-ke="profile-back"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </AdminDeskLink>
          ) : (
            <Link
              to={backTo}
              aria-label={backCopy ?? t("back")}
              data-ke="profile-back"
              onClick={(event) => {
                if (!router.history.canGoBack()) return;
                event.preventDefault();
                router.history.back();
              }}
              className="grid size-11 place-items-center rounded-full text-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </Link>
          )}
          {section === "profile" && !editing && canEditProfile ? (
            <Link
              to={accountTo}
              search={{ ...homeSearch, edit: "1" as const }}
              data-ke="profile-edit"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-primary touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {t("profileEdit")}
            </Link>
          ) : editing ? (
            <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold">
              {editField === "name"
                ? t("name")
                : editField === "phone"
                  ? t("accountPhone")
                  : editField === "email"
                    ? t("email")
                    : editField === "work"
                      ? t("anchorWorkLabel")
                      : editField === "about"
                        ? t("accountBio")
                        : t("profileEditTitle")}
            </h1>
          ) : section !== "profile" ? (
            <h1 className="min-w-0 truncate text-base font-semibold">
              {sections.find((item) => item.id === section)?.label}
            </h1>
          ) : (
            <span className="size-11" aria-hidden />
          )}
          {editing && !editField ? (
            <button
              type="button"
              aria-label={t("close")}
              data-ke="profile-cancel"
              onClick={discardEdits}
              className="grid size-11 place-items-center rounded-full text-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : editing ? (
            <span className="size-11" aria-hidden />
          ) : null}
        </div>
        {section === "profile" && !editing && user ? (
          <>
            <RoleSwitchPill placement="flow" />
            <ProfileHeroCard
              userId={user.id}
              photo={user.profileImageUrl}
              name={name || user.displayName || t("profile")}
              roleId={roleId}
              emailVerified={user.emailVerified === true}
              licensed={daycareStats ? Boolean(profileDesk?.listings.some((listing) => listing.licensed)) : false}
              reviewCount={daycareStats ? reviewCount : null}
              ratingX10={daycareStats ? ratingX10 : null}
              years={yearsOnKidEase(joinedAt)}
              childCount={daycareStats ? null : profileDesk?.ok ? profileDesk.childCount : null}
            />
            {roleId === "parent" ? (
              <ProfileChildren children={profileDesk?.ok ? profileDesk.children : []} />
            ) : null}
            <ProfileFacts rows={profileFactRows()} bio={bio} />
            {daycareStats && profileDesk?.ok ? (
              <ProfileDeskExtras listings={profileDesk.listings} reviews={profileDesk.reviews} />
            ) : null}
            <nav data-ke="account-sections" aria-label={t("menuAccountSettings")} className="mt-8 border-t border-border">
              <h2 className="px-1 pb-1 pt-4 text-sm font-semibold">{t("menuAccountSettings")}</h2>
              {sections
                .filter((item) => item.id !== "profile")
                .map((item) => (
                  <Link
                    key={item.id}
                    to={accountTo}
                    search={sectionSearch(item.id)}
                    data-ke={`account-section-${item.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-[15px] touch-manipulation"
                  >
                    {item.label}
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                ))}
            </nav>
          </>
        ) : null}
        {section === "profile" && !editing && !user ? (
          isPending ? (
            <div className="mt-6">
              <DeskSkeleton />
            </div>
          ) : (
            <div className="mt-8 text-center">
              <h1 className="font-display text-[1.75rem]">{t("profile")}</h1>
              <p className="mt-3 text-sm text-muted">{t("accountSettingsGuest")}</p>
              <Button className="mt-6" size="lg" asChild>
                <Link to="/login" search={parentLoginSearch("/account?tab=profile")}>
                  {t("accountSignInPhoto")}
                </Link>
              </Button>
            </div>
          )
        ) : null}
        {section === "documents" ? <FamilyVaultPanel signedIn={Boolean(user)} /> : null}
        {section === "alerts" && user ? (
          <AlertPushSettings
            audience={desk === "provider" ? "daycare" : "parent"}
            subscriptionsOn={chrome.subscriptionsEnabled === true}
          />
        ) : null}
        {section === "appearance" ? (
          <section className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <AppearanceControl />
          </section>
        ) : null}
        {section === "refer" && user ? <ReferFriendPanel /> : null}
        {section === "subscription" ? (
          <section className="ke-digital-plan mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="digital-plan">
            <h2 className="font-display text-xl">{t("navUpgrade")}</h2>
            <p className="mt-2 text-sm text-muted">{t("accountSubscriptionLead")}</p>
            <Button className="mt-4" asChild>
              <Link
                to={desk === "provider" ? "/provider/subscription" : "/parent"}
                search={desk === "provider" ? undefined : { tab: "subscription" }}
              >
                {t("navUpgrade")}
              </Link>
            </Button>
          </section>
        ) : null}
        {section === "delete" && user ? (
          <div data-ke="account-delete">
            <DeleteAccountPanel signedIn />
          </div>
        ) : null}
        {section === "security" && (user || (chrome.signedIn && !chrome.pending)) ? (
          <div className="mt-8" data-ke="account-security">
            <AccountSecurity email={email || user?.primaryEmail || ""} />
            <SignedInDevices />
          </div>
        ) : null}
        {section === "wallet" && user && connect.enabled ? <ParentWallet state={connect} /> : null}
        {section === "email-sms" && user ? (
          <form onSubmit={onSave} className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="account-email-sms">
            <h2 className="font-display text-lg tracking-[-0.02em]">{t("emailAndSms")}</h2>
            <p className="text-[13px] text-muted">{t("accountEmailNote")}</p>
            <CaslConsentFields value={consents} onChange={setConsents} />
            {smsNote ? (
              <p className="text-sm text-danger" role="alert">
                {smsNote}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? t("loading") : t("accountSaveDetails")}
            </Button>
            <p className="text-[12px] text-subtle">
              <Link
                to="/unsubscribe"
                search={{ token: undefined, channel: undefined }}
                className="underline-offset-4 hover:underline"
              >
                {t("unsubscribe")}
              </Link>
            </p>
          </form>
        ) : null}
        {section === "profile" && editing ? (
        <>
        {isPending && !user ? (
          <div className="mt-6">
            <DeskSkeleton />
          </div>
        ) : user ? (
          <form ref={formRef} onSubmit={(e) => void onSave(e, true)} className="mt-6" data-ke="profile-edit-form">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !user) return;
                setBusy(true);
                void compressProfileFile(file)
                  .then(async (dataUrl) => {
                    writeProfilePhoto(user.id, dataUrl);
                    await authClient.updateUser({ image: dataUrl });
                    confirmAction(t, "photoUploaded", { title: t("accountPhotoUpdated") });
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : t("accountPhotoFailed")))
                  .finally(() => setBusy(false));
              }}
            />
            {editField == null ? (
              <>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <ProfileAvatar userId={user.id} fallback={user.profileImageUrl} name={name || user.displayName} size="hero" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => inputRef.current?.click()}
                      className="absolute -bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center rounded-full border border-fg bg-bg px-3 text-sm font-semibold touch-manipulation"
                    >
                      {busy ? t("loading") : t("profileEdit")}
                    </button>
                  </div>
                </div>
                <h2 className="mt-8 text-sm font-semibold">{t("profileMyProfile")}</h2>
                <p className="mt-1 text-sm text-muted">{t("profilePublicNote")}</p>
                <ul className="mt-3 border-t border-border">
                  {(
                    [
                      { id: "name" as const, label: t("name"), value: name },
                      { id: "phone" as const, label: t("accountPhone"), value: phone },
                      { id: "email" as const, label: t("email"), value: email },
                      { id: "work" as const, label: t("anchorWorkLabel"), value: workQuery },
                    ]
                  ).map((row) => (
                    <li key={row.id} className="border-b border-border">
                      <button
                        type="button"
                        data-ke={`profile-field-${row.id}`}
                        onClick={() => setEditField(row.id)}
                        className="flex min-h-14 w-full items-center gap-3 text-left touch-manipulation"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-muted">{row.label}</span>
                          <span className="block truncate text-[15px]" data-ke={row.id === "name" ? "profile-name-value" : undefined}>
                            {row.value.trim() || "—"}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                {bio.trim() ? <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed">{bio}</p> : null}
                <button
                  type="button"
                  data-ke="profile-edit-about"
                  onClick={() => setEditField("about")}
                  className="mt-3 inline-flex min-h-11 items-center rounded-full border border-fg px-4 text-sm font-semibold touch-manipulation"
                >
                  {t("profileEditAbout")}
                </button>
              </>
            ) : null}
            {editField === "name" ? (
              <label className="mt-6 block text-sm" htmlFor="profile-name">
                {t("name")}
                <RequiredMark french={locale === "fr"} />
                <input
                  id="profile-name"
                  data-ke="profile-name"
                  className={`ke-input mt-1 ${fieldErrorClass(nameInvalid)}`}
                  value={name}
                  aria-required="true"
                  aria-invalid={nameInvalid || undefined}
                  onChange={(e) => {
                    contactDirty.current.name = true;
                    nameRef.current = e.target.value;
                    setName(e.target.value);
                    if (e.target.value.trim()) setNameInvalid(false);
                  }}
                  autoComplete="name"
                  maxLength={80}
                />
              </label>
            ) : null}
            {nameInvalid && editField === "name" ? (
              <p role="alert" data-ke="profile-required-note" className="mt-3 text-sm text-danger">
                {t("profileRequiredNote")}
              </p>
            ) : null}
            {editField === "phone" ? (
              <label className="mt-6 block text-sm">
                {t("accountPhone")}
                <input
                  className="ke-input mt-1"
                  value={phone}
                  onChange={(e) => {
                    contactDirty.current.phone = true;
                    phoneRef.current = e.target.value;
                    setPhone(e.target.value);
                  }}
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={32}
                  placeholder="204-555-0100"
                />
              </label>
            ) : null}
            {editField === "email" ? (
              <label className="mt-6 block text-sm">
                {t("email")}
                <input className="ke-input mt-1 bg-bg" value={email} readOnly autoComplete="email" />
                <span className="mt-2 block text-[12px] text-subtle">{t("accountEmailNote")}</span>
              </label>
            ) : null}
            {editField === "work" ? (
              <div className="mt-6">
                <p className="text-sm font-medium">{t("anchorWorkLabel")}</p>
                <p className="mt-1 text-[13px] text-muted">{t("anchorNeedWork")}</p>
                <PlaceSearch
                  value={workQuery}
                  onChange={setWorkQuery}
                  onResolved={(place) => {
                    setWorkOrigin(place);
                    setWorkQuery(place.label);
                    if (anchorMode === "home") setAnchorMode("both");
                  }}
                  placeholder={t("anchorWorkPh")}
                  origin={origin}
                  inputClassName="ke-input mt-2 w-full"
                />
              </div>
            ) : null}
            {editField === "about" ? (
              <label className="mt-6 block text-sm">
                {t("accountBio")}
                <textarea
                  className="ke-input mt-1 min-h-24 resize-y"
                  value={bio}
                  onChange={(e) => {
                    contactDirty.current.bio = true;
                    bioRef.current = e.target.value;
                    setBio(e.target.value);
                  }}
                  maxLength={400}
                  placeholder={t("accountBioPh")}
                />
                <span className="mt-1 block text-right text-[12px] text-subtle">{bio.length}/400</span>
              </label>
            ) : null}
            {smsNote ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {smsNote}
              </p>
            ) : null}
            <div className="sticky bottom-0 z-10 mt-8 bg-bg py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="submit"
                data-ke="account-save-details"
                disabled={saving}
                className="flex min-h-11 w-full items-center justify-center rounded-full bg-fg px-4 text-sm font-semibold text-bg touch-manipulation"
              >
                {saving ? t("loading") : t("profileDone")}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-8 text-center text-sm text-muted">{t("accountSettingsGuest")}</p>
        )}
        </>
        ) : null}
      </main>
    </AccountDeskFrame>
  );
}
