import { BadgeCheck, Briefcase, Mail, Phone } from "lucide-react";
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
  reviewCount,
  ratingX10,
  years,
}: {
  userId?: string | null;
  photo?: string | null;
  name: string;
  roleId: ProfileRoleId | null;
  emailVerified: boolean;
  reviewCount: number | null;
  ratingX10: number | null;
  years: number | null;
}) {
  const { t } = useCopy();
  const showReviews = typeof reviewCount === "number" && reviewCount > 0;
  const showRating = typeof ratingX10 === "number" && ratingX10 > 0;
  const showYears = typeof years === "number" && years >= 1;
  const showStats = showReviews || showRating || showYears;

  return (
    <div className="mt-2 flex items-start gap-4" data-ke="profile-hero">
      <div className="relative shrink-0">
        <ProfileAvatar userId={userId} fallback={photo} name={name} size="hero" />
        {emailVerified ? (
          <span
            className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full bg-primary text-primary-fg ring-2 ring-bg"
            data-ke="profile-verified"
            role="img"
            aria-label={t("profileEmailVerified")}
          >
            <BadgeCheck className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.03em]">{name}</h1>
        {roleId ? <p className="mt-1 text-sm text-muted">{t(ROLE_COPY[roleId])}</p> : null}
        {showStats ? (
          <dl className="mt-4 flex flex-col gap-3" data-ke="profile-stats">
            {showReviews ? (
              <div>
                <dd className="font-display text-xl tabular-nums leading-none">{reviewCount}</dd>
                <dt className="mt-1 text-xs text-muted">{t("menuReviews")}</dt>
              </div>
            ) : null}
            {showRating ? (
              <div>
                <dd className="font-display text-xl tabular-nums leading-none">{(ratingX10 / 10).toFixed(1)}</dd>
                <dt className="mt-1 text-xs text-muted">{t("profileRating")}</dt>
              </div>
            ) : null}
            {showYears ? (
              <div>
                <dd className="font-display text-xl tabular-nums leading-none">{years}</dd>
                <dt className="mt-1 text-xs leading-snug text-muted">{t("profileYears")}</dt>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileFacts({
  email,
  phone,
  work,
  bio,
}: {
  email: string;
  phone: string;
  work: string;
  bio: string;
}) {
  const { t } = useCopy();
  const rows = [
    email.trim() ? { id: "email", icon: Mail, label: t("email"), value: email.trim() } : null,
    phone.trim() ? { id: "phone", icon: Phone, label: t("accountPhone"), value: phone.trim() } : null,
    work.trim() ? { id: "work", icon: Briefcase, label: t("anchorWorkLabel"), value: work.trim() } : null,
  ].filter((row): row is { id: string; icon: typeof Mail; label: string; value: string } => row != null);
  const about = bio.trim();

  return (
    <>
      {rows.length ? (
        <ul className="mt-6 border-t border-border" data-ke="profile-facts">
          {rows.map((row) => (
            <li key={row.id} className="flex min-h-14 items-center gap-3 border-b border-border py-2">
              <row.icon className="size-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs text-muted">{row.label}</span>
                <span className="block break-words text-[15px]">{row.value}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {about ? (
        <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed" data-ke="profile-bio">
          {about}
        </p>
      ) : null}
    </>
  );
}
