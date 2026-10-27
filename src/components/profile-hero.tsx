import { BadgeCheck, Baby, Briefcase, Clock, Languages, Mail, MapPin, Phone, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { CopyKey } from "@/lib/copy";
import type { ProfileRoleId } from "@/lib/profile-hero";
import { useCopy } from "@/lib/use-copy";

const ROLE_COPY: Record<ProfileRoleId, CopyKey> = {
  parent: "deskParent",
  daycare: "deskDirector",
  admin: "deskAdmin",
  support: "deskSupport",
};

export function ProfileHeroCard({
  userId,
  photo,
  name,
  roleId,
  emailVerified,
  licensed,
  reviewCount,
  ratingX10,
  years,
  childCount,
}: {
  userId?: string | null;
  photo?: string | null;
  name: string;
  roleId: ProfileRoleId | null;
  emailVerified: boolean;
  licensed?: boolean;
  reviewCount: number | null;
  ratingX10: number | null;
  years: number | null;
  childCount?: number | null;
}) {
  const { t } = useCopy();
  const daycare = roleId === "daycare";
  const stats = [
    daycare && typeof reviewCount === "number" && reviewCount > 0
      ? { id: "reviews", value: String(reviewCount), label: t("menuReviews") }
      : null,
    daycare && typeof ratingX10 === "number" && ratingX10 > 0
      ? { id: "rating", value: `${(ratingX10 / 10).toFixed(1)}★`, label: t("profileRating") }
      : null,
    typeof years === "number" && years >= 1 ? { id: "years", value: String(years), label: t("profileYears") } : null,
    !daycare && typeof childCount === "number" && childCount > 0
      ? { id: "children", value: String(childCount), label: t("profileChildren") }
      : null,
    !daycare && emailVerified ? { id: "verified", value: t("profileVerifiedYes"), label: t("profileVerifiedStat") } : null,
  ].filter((stat): stat is { id: string; value: string; label: string } => stat != null);

  return (
    <div className="mt-4 rounded-[1.25rem] bg-surface-2 p-5" data-ke="profile-hero">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="relative w-fit">
            <ProfileAvatar userId={userId} fallback={photo} name={name} size="hero" />
            {emailVerified ? (
              <span
                className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full bg-primary text-primary-fg ring-2 ring-surface-2"
                data-ke="profile-verified"
                role="img"
                aria-label={t("profileEmailVerified")}
              >
                <BadgeCheck className="size-4" aria-hidden />
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 text-[1.65rem] font-semibold leading-tight tracking-[-0.03em]">{name}</h1>
          {roleId ? <p className="mt-1 text-sm text-muted">{t(ROLE_COPY[roleId])}</p> : null}
          {licensed ? (
            <p className="mt-2 inline-flex min-h-7 items-center rounded-full bg-bg px-2.5 text-xs font-semibold text-primary" data-ke="profile-licensed">
              {t("profileLicensed")}
            </p>
          ) : null}
        </div>
        {stats.length ? (
          <dl className="w-[7.5rem] shrink-0 border-l border-border pl-4" data-ke="profile-stats">
            {stats.map((stat, index) => (
              <div key={stat.id} className={index ? "mt-3 border-t border-border pt-3" : undefined} data-ke={`profile-stat-${stat.id}`}>
                <dd className="font-display text-xl tabular-nums leading-none">{stat.value}</dd>
                <dt className="mt-1 text-xs leading-snug text-muted">{stat.label}</dt>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

export type ProfileFact = { id: string; label: string; value: string };

const FACT_ICON: Record<string, LucideIcon> = {
  ages: Baby,
  hours: Clock,
  languages: Languages,
  spots: Users,
  area: MapPin,
  email: Mail,
  phone: Phone,
  work: Briefcase,
};

export function ProfileFacts({ rows, bio }: { rows: ProfileFact[]; bio: string }) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const visible = open ? rows : rows.slice(0, 3);
  const about = bio.trim();

  return (
    <>
      {rows.length ? (
        <div className="mt-6" data-ke="profile-facts">
          <ul>
            {visible.map((row) => {
              const Icon = FACT_ICON[row.id] ?? MapPin;
              return (
              <li key={row.id} className="flex min-h-14 items-center gap-3 border-b border-border py-2">
                <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{row.label}</span>
                  <span className="block break-words text-[15px]">{row.value}</span>
                </span>
              </li>
              );
            })}
          </ul>
          {rows.length > 3 ? (
            <button
              type="button"
              data-ke="profile-show-all"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-fg px-4 text-sm font-semibold touch-manipulation"
            >
              {open ? t("profileShowLess") : t("profileShowAll")}
            </button>
          ) : null}
        </div>
      ) : null}
      {about ? (
        <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed" data-ke="profile-bio">
          {about}
        </p>
      ) : null}
    </>
  );
}
