import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Globe, Search, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AccountSecurity } from "@/components/account-security";
import { DeleteAccountPanel } from "@/components/delete-account-panel";
import { NotificationBell } from "@/components/notification-bell";
import { AppearanceControl } from "@/components/appearance-control";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  ageRangeLabel,
  airbnbAccountRows,
  airbnbPublicPlace,
  freshnessLine,
  maskEmail,
  maskPhone,
  readKnownLanguages,
  writeKnownLanguages,
  type AirbnbAccountRowId,
} from "@/lib/airbnb-ui";
import { airbnbCopy, type AirbnbCopy } from "@/lib/airbnb-ui-copy";
import { applyDocumentLocale, languageMeta, shippedLanguages } from "@/lib/languages";
import { localePath, localeSwitchPath } from "@/lib/locale-path";
import { writeLocaleChoiceCookie } from "@/lib/locale-geo";
import { photoUrl } from "@/lib/photo";
import { saveMyLocale } from "@/lib/server/account-prefs";
import { getMyContact, saveMyContact, type ContactProfile } from "@/lib/server/profile-contact";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { NotificationPreferences } from "@/components/notification-preferences";
import { cn } from "@/lib/utils";
import { useSessionDesks } from "@/components/session-desks";
import { roleSwitchTarget } from "@/lib/app-menu";
import { parentDeskPath, providerDeskPath } from "@/lib/desk-nav";
import { headerDesks, highlightDesk, parseDeskQuery, showDeskSwitcher } from "@/lib/desks";
import type { DaycareCard, Locale } from "@/lib/types";

function useFr() {
  const { locale, t } = useCopy();
  return { locale, copy: airbnbCopy(locale), fr: locale === "fr", t };
}

/** Every licensed childcare class, plus the open-spots filter. Short labels already in the product dictionary. */
const CARE_CATEGORIES: { id: string; label: keyof AirbnbCopy; search?: Record<string, string> }[] = [
  { id: "all", label: "careAll" },
  { id: "child_care_centre", label: "careCentres", search: { fac: "child_care_centre" } },
  { id: "family_home", label: "careHomes", search: { fac: "family_home" } },
  { id: "group_home", label: "careGroup", search: { fac: "group_home" } },
  { id: "nursery_preschool", label: "careNursery", search: { fac: "nursery_preschool" } },
  { id: "school_age", label: "careSchool", search: { fac: "school_age" } },
  { id: "before_after", label: "careBefore", search: { cat: "before-after" } },
  { id: "open", label: "careOpen", search: { openings: "1" } },
];

function CareIcon({ id }: { id: string }) {
  const props = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (id === "child_care_centre") {
    return (
      <svg {...props}>
        <path d="M6 28V12l10-6 10 6v16" />
        <path d="M13 28v-7h6v7M10 16h2M20 16h2M10 21h2M20 21h2" />
      </svg>
    );
  }
  if (id === "family_home") {
    return (
      <svg {...props}>
        <path d="M5 15 16 6l11 9" />
        <path d="M8 14v13h16V14" />
        <path d="M13 27v-6h6v6" />
      </svg>
    );
  }
  if (id === "group_home") {
    return (
      <svg {...props}>
        <path d="M3 16 10 10l7 6" />
        <path d="M5 15v10h10V15" />
        <path d="M15 18l6-5 7 6" />
        <path d="M17 18v7h10v-7" />
      </svg>
    );
  }
  if (id === "nursery_preschool") {
    return (
      <svg {...props}>
        <rect x="7" y="16" width="7" height="7" rx="1.5" />
        <rect x="18" y="16" width="7" height="7" rx="1.5" />
        <path d="M10.5 16v-2a5.5 5.5 0 0 1 11 0v2" />
      </svg>
    );
  }
  if (id === "school_age") {
    return (
      <svg {...props}>
        <path d="M7 13h12l4 4v10H7V13z" />
        <path d="M19 13v4h4M11 13V9a3 3 0 0 1 6 0v4" />
      </svg>
    );
  }
  if (id === "before_after") {
    return (
      <svg {...props}>
        <path d="M6 20a8 8 0 0 1 14-5" />
        <path d="M16 6v3M22 8l-2 2M24 15h-3" />
        <path d="M8 24h16" />
      </svg>
    );
  }
  if (id === "open") {
    return (
      <svg {...props}>
        <circle cx="16" cy="16" r="8" />
        <path d="m12.5 16.2 2.2 2.2 4.8-5" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <rect x="5" y="5" width="8" height="8" rx="2" />
      <rect x="19" y="5" width="8" height="8" rx="2" />
      <rect x="5" y="19" width="8" height="8" rx="2" />
      <rect x="19" y="19" width="8" height="8" rx="2" />
    </svg>
  );
}

export function AirbnbCareCategories() {
  const { locale, copy, t } = useFr();
  return (
    <div className="ke-airbnb-cats" data-ke="airbnb-care-cats" role="navigation" aria-label={t("railByCare")}>
      {CARE_CATEGORIES.map((cat, index) => {
        const on = cat.id === "all";
        return (
          <Link
            key={cat.id}
            to={localePath(cat.search ? "/search" : "/", locale)}
            {...(cat.search ? { search: cat.search as never } : {})}
            data-ke={`airbnb-care-${cat.id}`}
            className={cn("ke-airbnb-cat", on && "is-on")}
            aria-current={on ? "page" : undefined}
          >
            <span className="ke-airbnb-cat-art" style={{ animationDelay: `${index * 0.14}s` }}>
              <CareIcon id={cat.id} />
            </span>
            <span className="ke-airbnb-cat-label">{copy[cat.label]}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function AirbnbHome({
  listings,
  place,
  search,
}: {
  listings: DaycareCard[];
  place: string;
  search?: ReactNode;
  /** Kept so older callers still type-check. The icon row replaces the text chips. */
  showChips?: boolean;
}) {
  const { locale, copy } = useFr();
  const rows = listings.slice(0, 8);
  return (
    <section className="ke-airbnb-phone-only ke-airbnb-screen" data-ke="airbnb-home">
      <div className="ke-airbnb-sticky">
        {search ?? (
          <Link
            to={localePath("/search", locale)}
            data-ke="airbnb-pill"
            className="ke-airbnb-pill"
          >
            <Search aria-hidden="true" />
            <span>{copy.findNear}</span>
          </Link>
        )}
        <AirbnbCareCategories />
      </div>
      {rows.length ? (
        <p className="ke-airbnb-count" data-ke="airbnb-count">
          {copy.nearby.replace("{n}", String(rows.length))}
          {place ? ` · ${place}` : ""}
        </p>
      ) : (
        <p className="ke-airbnb-count">{copy.emptyHome}</p>
      )}
      <div className="ke-airbnb-rail" data-ke="airbnb-rail">
        {rows.map((row) => {
          const photo = row.photos?.find(Boolean);
          const where = airbnbPublicPlace(row);
          const ages = ageRangeLabel(row.ageMinMonths, row.ageMaxMonths, locale);
          const fresh = freshnessLine(row.spotsUpdatedAt || row.lastVacancyUpdatedAt, locale);
          return (
            <Link
              key={row.id}
              to={localePath(`/daycare/${row.slug}`, locale)}
              className="ke-airbnb-card"
              data-ke="airbnb-card"
            >
              <span className="ke-airbnb-photo">
                {photo ? <img src={photoUrl(photo, 800)} alt="" /> : null}
              </span>
              <span className="ke-airbnb-card-title">{locale === "fr" && row.nameFr ? row.nameFr : row.name}</span>
              {where ? <span className="ke-airbnb-card-meta">{where}</span> : null}
              {ages ? <span className="ke-airbnb-card-meta">{ages}</span> : null}
              {fresh ? <span className="ke-airbnb-card-meta">{fresh}</span> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function AirbnbMenu({
  onAccount,
}: {
  onAccount: () => void;
}) {
  const { locale, copy } = useFr();
  const { user } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const name = user?.displayName || user?.primaryEmail || copy.account;
  const lang = languageMeta(locale).native;
  return (
    <section className="ke-airbnb-phone-only ke-airbnb-screen" data-ke="airbnb-menu">
      <header className="ke-airbnb-title-row">
        <h1>{copy.menu}</h1>
        <NotificationBell />
      </header>
      <Link
        to={localePath("/menu", locale)}
        search={{ screen: "account" }}
        className="ke-airbnb-profile"
        data-ke="airbnb-profile"
      >
        <span className="ke-airbnb-avatar" aria-hidden="true">
          {(user?.displayName || "K").slice(0, 1).toUpperCase()}
        </span>
        <span>
          <strong>{name}</strong>
          <em>{copy.viewProfile}</em>
        </span>
      </Link>
      <button type="button" className="ke-airbnb-row" data-ke="airbnb-row-account" onClick={onAccount}>
        <span>{copy.account}</span>
        <ChevronRight aria-hidden="true" />
      </button>
      <Link to={localePath("/menu", locale)} search={{ section: "help" }} className="ke-airbnb-row">
        <span>{locale === "fr" ? "Aide" : "Get help"}</span>
        <ChevronRight aria-hidden="true" />
      </Link>
      <Link to={localePath("/menu", locale)} search={{ section: "legal" }} className="ke-airbnb-row">
        <span>{copy.legal}</span>
        <ChevronRight aria-hidden="true" />
      </Link>
      <Link
        to={localePath("/menu", locale)}
        search={{ screen: "language" }}
        className="ke-airbnb-globe"
        data-ke="airbnb-globe"
      >
        <Globe aria-hidden="true" />
        <span>{lang}</span>
      </Link>
      <p className="sr-only">{pathname}</p>
    </section>
  );
}

const ROW_LABEL: Record<AirbnbAccountRowId, keyof ReturnType<typeof airbnbCopy>> = {
  personal: "personal",
  security: "security",
  privacy: "privacy",
  notifications: "notifications",
  language: "language",
  payments: "payments",
  accessibility: "accessibility",
  legal: "legal",
  "sign-out": "signOut",
};

export function AirbnbAccount() {
  const { locale, copy } = useFr();
  const { user } = useCurrentUserState();
  const [pane, setPane] = useState<AirbnbAccountRowId | "hub">("hub");
  const rows = airbnbAccountRows(Boolean(user));
  if (pane === "personal") return <AirbnbPersonal onBack={() => setPane("hub")} />;
  if (pane === "security") {
    return (
      <AirbnbSubpage title={copy.security} onBack={() => setPane("hub")}>
        <AccountSecurity email={user?.primaryEmail || ""} />
      </AirbnbSubpage>
    );
  }
  if (pane === "privacy") {
    return (
      <AirbnbSubpage title={copy.privacy} onBack={() => setPane("hub")}>
        <DeleteAccountPanel signedIn={Boolean(user)} />
      </AirbnbSubpage>
    );
  }
  if (pane === "accessibility") {
    return (
      <AirbnbSubpage title={copy.accessibility} onBack={() => setPane("hub")}>
        <AppearanceControl />
        <p className="ke-airbnb-help">{copy.motionNote}</p>
      </AirbnbSubpage>
    );
  }
  if (pane === "payments") {
    return (
      <AirbnbSubpage title={copy.payments} onBack={() => setPane("hub")}>
        <p className="ke-airbnb-help">{copy.receiptsOnly}</p>
        <Link to={localePath("/menu", locale)} search={{ screen: "payments" }} className="ke-airbnb-pill-btn">
          {copy.paymentsNote}
        </Link>
      </AirbnbSubpage>
    );
  }
  return (
    <section className="ke-airbnb-screen" data-ke="airbnb-account">
      <h1>{copy.account}</h1>
      <nav className="ke-airbnb-hub" aria-label={copy.account}>
        {rows.map((id) =>
          id === "sign-out" ? (
            <button key={id} type="button" className="ke-airbnb-row" data-ke="airbnb-sign-out" onClick={() => void signOut("/")}>
              <span>{copy.signOut}</span>
            </button>
          ) : id === "notifications" ? (
            <Link key={id} to={localePath("/menu", locale)} search={{ screen: "notifications" }} className="ke-airbnb-row" data-ke={`airbnb-row-${id}`}>
              <span>{copy[ROW_LABEL[id]]}</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : id === "language" ? (
            <Link key={id} to={localePath("/menu", locale)} search={{ screen: "language" }} className="ke-airbnb-row" data-ke="airbnb-row-language">
              <span>{copy.language}</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : id === "legal" ? (
            <Link key={id} to={localePath("/menu", locale)} search={{ section: "legal" }} className="ke-airbnb-row">
              <span>{copy.legal}</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : (
            <button key={id} type="button" className="ke-airbnb-row" data-ke={`airbnb-row-${id}`} onClick={() => setPane(id)}>
              <span>{copy[ROW_LABEL[id]]}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          ),
        )}
      </nav>
    </section>
  );
}

function AirbnbSubpage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  const { copy } = useFr();
  return (
    <section className="ke-airbnb-screen" data-ke="airbnb-subpage">
      <button type="button" className="ke-airbnb-text-btn" onClick={onBack}>
        {copy.back}
      </button>
      <h1>{title}</h1>
      {children}
    </section>
  );
}

type EditField = "name" | "phone" | "bio";

export function AirbnbPersonal({ onBack }: { onBack: () => void }) {
  const { copy } = useFr();
  const { user } = useCurrentUserState();
  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [editing, setEditing] = useState<EditField | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void getMyContact()
      .then((row) => {
        if (live) setContact(row);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user]);

  if (!user) {
    return (
      <AirbnbSubpage title={copy.personal} onBack={onBack}>
        <Link to="/login" search={{ next: "/menu?screen=account" }} className="ke-airbnb-pill-btn">
          {copy.signIn}
        </Link>
      </AirbnbSubpage>
    );
  }

  const email = contact?.email || user.primaryEmail || "";
  const fields: { id: EditField; label: string; value: string; help: string; masked: string }[] = [
    {
      id: "name",
      label: copy.name,
      value: contact?.name || user.displayName || "",
      help: copy.nameHelp,
      masked: contact?.name || user.displayName || "",
    },
    {
      id: "phone",
      label: copy.phone,
      value: contact?.phone || "",
      help: copy.phoneHelp,
      masked: maskPhone(contact?.phone || ""),
    },
    {
      id: "bio",
      label: copy.about,
      value: contact?.bio || "",
      help: copy.aboutHelp,
      masked: contact?.bio || "",
    },
  ];

  async function save(field: EditField) {
    if (!contact || saving) return;
    setSaving(true);
    setNote("");
    try {
      const next = await saveMyContact({
        data: {
          name: field === "name" ? draft : contact.name,
          phone: field === "phone" ? draft : contact.phone,
          bio: field === "bio" ? draft : contact.bio,
        },
      });
      setContact(next);
      setEditing(null);
      setNote(copy.saved);
    } catch {
      setNote(copy.cancel);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AirbnbSubpage title={copy.personal} onBack={onBack}>
      <div data-ke="airbnb-personal">
        <div className={cn("ke-airbnb-info", editing && "is-dim")}>
          <div>
            <span>{copy.email}</span>
            <strong>{maskEmail(email) || email}</strong>
          </div>
          <p className="ke-airbnb-help">{copy.emailHelp}</p>
        </div>
        {fields.map((field) => {
          const open = editing === field.id;
          const dim = Boolean(editing && !open);
          return (
            <div key={field.id} className={cn("ke-airbnb-info", dim && "is-dim")} data-ke={`airbnb-field-${field.id}`}>
              <div>
                <span>{field.label}</span>
                {open ? null : <strong>{field.id === "phone" ? field.masked || "—" : field.masked || "—"}</strong>}
              </div>
              {open ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(field.id);
                  }}
                >
                  <label className="ke-airbnb-field">
                    <span>{field.label}</span>
                    <input value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
                  </label>
                  <p className="ke-airbnb-help">{field.help}</p>
                  <div className="ke-airbnb-actions">
                    <button type="submit" className="ke-airbnb-pill-btn" disabled={saving} data-ke="airbnb-save">
                      {copy.save}
                    </button>
                    <button type="button" className="ke-airbnb-text-btn" data-ke="airbnb-cancel" onClick={() => setEditing(null)}>
                      {copy.cancel}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="ke-airbnb-text-btn"
                  data-ke={`airbnb-edit-${field.id}`}
                  disabled={Boolean(editing)}
                  onClick={() => {
                    setEditing(field.id);
                    setDraft(field.value);
                    setNote("");
                  }}
                >
                  {copy.edit}
                </button>
              )}
            </div>
          );
        })}
        {note ? <p role="status">{note}</p> : null}
      </div>
    </AirbnbSubpage>
  );
}

export function AirbnbLanguage() {
  const { locale, copy } = useFr();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setLocale = useAppStore((s) => s.setLocale);
  const { user } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const titleId = useId();

  useEffect(() => {
    const saved = readKnownLanguages();
    setKnown(saved);
    setPicked(saved);
  }, []);

  function choose(code: Locale) {
    writeLocaleChoiceCookie(code);
    setLocale(code, { lock: true });
    applyDocumentLocale(code);
    const dest = localeSwitchPath(pathname, code);
    if (user) void saveMyLocale({ data: { locale: code } }).catch(() => undefined);
    if (dest) window.location.assign(dest);
  }

  const current = languageMeta(locale);
  const dirty = picked.slice().sort().join() !== known.slice().sort().join();
  const languages = shippedLanguages().filter((lang) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return lang.native.toLowerCase().includes(q) || lang.nameEn.toLowerCase().includes(q);
  });

  return (
    <section className="ke-airbnb-screen" data-ke="airbnb-language">
      <Link to={localePath("/menu", locale)} search={{ screen: "account" }} className="ke-airbnb-text-btn">
        {copy.back}
      </Link>
      <h1>{copy.language}</h1>
      <article className="ke-airbnb-lang-card">
        <p>{copy.appLanguage}</p>
        <strong>{current.native}</strong>
        <p className="ke-airbnb-help">{copy.editLanguage}</p>
        <div className="ke-airbnb-lang-list" role="radiogroup" aria-label={copy.appLanguage}>
          {shippedLanguages().map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="radio"
              aria-checked={lang.code === locale}
              data-ke={`airbnb-locale-${lang.code}`}
              className={cn("ke-airbnb-lang", lang.code === locale && "is-on")}
              onClick={() => choose(lang.code)}
            >
              <span>{lang.native}</span>
              {lang.code === locale ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      </article>
      <div className="ke-airbnb-known">
        <h2>{copy.knownLanguages}</h2>
        <button type="button" className="ke-airbnb-outline" data-ke="airbnb-add-languages" onClick={() => setOpen(true)}>
          {copy.addLanguages}
        </button>
        {known.length ? <p>{known.map((code) => languageMeta(code as Locale).native).join(" · ")}</p> : null}
      </div>
      {open ? (
        <div className="ke-airbnb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} data-ke="airbnb-lang-sheet">
          <button type="button" className="ke-airbnb-x" aria-label={copy.close} onClick={() => setOpen(false)}>
            <X />
          </button>
          <h2 id={titleId}>{copy.addLanguages}</h2>
          <input
            className="ke-airbnb-field-input"
            value={query}
            placeholder={copy.languageSearch}
            aria-label={copy.languageSearch}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="ke-airbnb-lang-list">
            {languages.map((lang) => {
              const on = picked.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  aria-pressed={on}
                  className={cn("ke-airbnb-lang", on && "is-on")}
                  onClick={() =>
                    setPicked((currentCodes) =>
                      currentCodes.includes(lang.code)
                        ? currentCodes.filter((code) => code !== lang.code)
                        : [...currentCodes, lang.code],
                    )
                  }
                >
                  <span>{lang.native}</span>
                  <span aria-hidden="true">{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="ke-airbnb-pill-btn"
            disabled={!dirty}
            data-ke="airbnb-lang-save"
            onClick={() => {
              writeKnownLanguages(picked);
              setKnown(picked);
              setOpen(false);
            }}
          >
            {copy.save}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function AirbnbAlerts() {
  return (
    <section className="ke-airbnb-phone-only ke-airbnb-screen" data-ke="airbnb-alerts">
      <NotificationPreferences />
    </section>
  );
}

export function AirbnbListingPhone({
  name,
  photo,
  place,
  freshness,
  action,
  onAction,
}: {
  name: string;
  photo?: string;
  place: string;
  freshness: string;
  action: "message" | "tour";
  onAction: () => void;
}) {
  const { copy } = useFr();
  const label = action === "message" ? copy.message : copy.tour;
  return (
    <section className="ke-airbnb-phone-only ke-airbnb-screen" data-ke="airbnb-listing">
      <span className="ke-airbnb-photo ke-airbnb-photo-hero">
        {photo ? <img src={photoUrl(photo, 960)} alt="" /> : null}
      </span>
      <h1 data-ke="airbnb-listing-name">{name}</h1>
      {place ? <p className="ke-airbnb-card-meta">{place}</p> : null}
      {freshness ? <p className="ke-airbnb-card-meta" data-ke="airbnb-freshness">{freshness}</p> : null}
      <button type="button" className="ke-airbnb-pill-btn" data-ke="airbnb-listing-action" onClick={onAction}>
        {label}
      </button>
    </section>
  );
}

export function AirbnbDeskPill() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const desk = useRouterState({
    select: (s) => parseDeskQuery((s.location.search as { desk?: string }).desk),
  });
  const { session, sticky, setSticky } = useSessionDesks();
  if (!session || !showDeskSwitcher(session.desks, session.role, session.email)) return null;
  const desks = headerDesks(session.desks, session.role, session.email);
  const current = highlightDesk(pathname, sticky, desk);
  const target = roleSwitchTarget(current, desks);
  if (!target) return null;
  return (
    <button
      type="button"
      className="ke-airbnb-desk-pill"
      data-ke="airbnb-desk-pill"
      onClick={() => {
        setSticky(target);
        void navigate({
          to: target === "parent" ? parentDeskPath(pathname) : providerDeskPath(pathname),
        });
      }}
    >
      {target === "parent" ? t("switchToParent") : t("switchToDaycare")}
    </button>
  );
}
