/** Original inline art for menu empty states. Decorative only. */

type ArtProps = { className?: string; tone?: "ink" | "onPrimary" };

export function KidBlocks({ className = "h-16 w-28", tone = "ink" }: ArtProps) {
  const onBlue = tone === "onPrimary";
  const blue = onBlue ? "currentColor" : "var(--color-primary)";
  const sky = onBlue ? "currentColor" : "#7eb6e0";
  const amber = onBlue ? "#f0c14a" : "#e8a317";
  const ink = onBlue ? "var(--color-primary)" : "#1a3790";
  return (
    <svg viewBox="0 0 112 72" className={className} aria-hidden data-ke="kid-art" data-art="blocks">
      <ellipse cx="56" cy="66" rx="34" ry="4" fill={ink} opacity={onBlue ? 0.25 : 0.08} />
      <rect x="16" y="40" width="26" height="20" rx="6" fill={sky} opacity={onBlue ? 0.55 : 1} />
      <rect x="34" y="24" width="26" height="22" rx="6" fill={blue} opacity={onBlue ? 0.95 : 1} />
      <rect x="56" y="44" width="22" height="16" rx="5" fill={amber} />
      <circle cx="90" cy="22" r="12" fill={amber} />
      <circle cx="86" cy="20" r="1.5" fill={ink} />
      <circle cx="94" cy="20" r="1.5" fill={ink} />
      <path d="M85.5 25.5c1.6 1.8 7.4 1.8 9 0" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function KidFamily({ className = "h-24 w-36" }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 88" className={className} aria-hidden data-ke="kid-art" data-art="family">
      <circle cx="46" cy="28" r="12" fill="var(--color-primary)" />
      <circle cx="78" cy="24" r="9" fill="#e8a317" />
      <path d="M28 70c2-14 12-20 18-20s16 6 18 20" fill="var(--color-primary)" opacity="0.85" />
      <path d="M66 66c1-10 8-14 12-14s11 4 12 14" fill="#7eb6e0" />
      <circle cx="108" cy="58" r="10" fill="none" stroke="var(--color-primary)" strokeWidth="3" />
      <path d="M92 58h16M100 46v12" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function KidNotebook({ className = "mx-auto h-20 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 80" className={className} aria-hidden data-ke="kid-art" data-art="notebook">
      <rect x="28" y="14" width="72" height="54" rx="8" fill="var(--color-primary)" opacity="0.12" />
      <path d="M64 16v50" stroke="var(--color-primary)" strokeWidth="2" opacity="0.45" />
      <rect x="38" y="28" width="18" height="4" rx="2" fill="var(--color-primary)" opacity="0.55" />
      <rect x="38" y="38" width="14" height="4" rx="2" fill="var(--color-primary)" opacity="0.35" />
      <circle cx="92" cy="36" r="8" fill="#e8a317" />
    </svg>
  );
}

export function KidStars({ className = "mx-auto h-20 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 80" className={className} aria-hidden data-ke="kid-art" data-art="stars">
      <rect x="18" y="16" width="68" height="52" rx="12" fill="var(--color-primary)" opacity="0.14" />
      <rect x="28" y="28" width="36" height="5" rx="2.5" fill="var(--color-primary)" opacity="0.7" />
      <rect x="28" y="40" width="24" height="5" rx="2.5" fill="var(--color-primary)" opacity="0.4" />
      <path
        d="M98 14l3.1 7.6 8.2.6-6.2 5.3 2 7.8L98 31.2l-7.1 4.1 2-7.8-6.2-5.3 8.2-.6z"
        fill="#e8a317"
      />
      <circle cx="108" cy="56" r="10" fill="#7eb6e0" />
      <circle cx="105" cy="54" r="1.3" fill="#1a3790" />
      <circle cx="111" cy="54" r="1.3" fill="#1a3790" />
      <path d="M104.5 58.5c1.2 1.4 5.8 1.4 7 0" stroke="#1a3790" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
