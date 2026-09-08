import { SOCIAL_PROFILES, type SocialNetwork } from "@/lib/social";
import { useCopy } from "@/lib/use-copy";

function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.75" />
      <circle cx="17.15" cy="6.85" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.2h2.42l.36-2.8H13.5V9.22c0-.81.22-1.36 1.39-1.36H16.4V5.36A18.7 18.7 0 0 0 13.96 5C11.54 5 9.9 6.48 9.9 9v2h-2.3v2.8H9.9V21h3.6Z" />
    </svg>
  );
}

function Mark({ network }: { network: SocialNetwork }) {
  return network === "instagram" ? <InstagramMark /> : <FacebookMark />;
}

export function HeaderSocial() {
  const { t } = useCopy();
  return (
    <nav className="hidden items-center [[data-channel=website]_&]:flex" aria-label="KidEase social">
      {SOCIAL_PROFILES.map((profile) => (
        <a
          key={profile.network}
          href={profile.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(profile.labelKey)}
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
        >
          <Mark network={profile.network} />
        </a>
      ))}
    </nav>
  );
}
