import type { ReactNode } from "react";

const NAVY = "#1a3790";
const CREAM = "#f6f3ee";
const PAPER = "#fffcf8";
const INK = "#1c2438";
const MUTED = "#5c6578";
const SUBTLE = "#8a847a";
const LINE = "#e3ddd3";

const PIN = (
  <svg viewBox="0 0 32 40" className="h-6 w-5" aria-hidden>
    <path fill={NAVY} d="M16 0c8.3 0 15 6.6 15 14.7 0 10.2-12.4 23.5-14.4 25.1a.9.9 0 0 1-1.2 0C13.4 38.2 1 24.9 1 14.7 1 6.6 7.7 0 16 0Z" />
    <circle cx="16" cy="14.2" r="7.2" fill="#fff" />
    <path fill={NAVY} d="M12.2 13.4c.3-1.6 1.6-2.6 3.3-2.6 1.2 0 2 .4 2.6 1.1.2.3 0 .6-.3.7l-1.3-.2c-.2 0-.4-.2-.5-.4-.2-.3-.6-.5-1.1-.5-.8 0-1.4.6-1.6 1.5-.2 1 .3 1.8 1.4 2.1.9.2 1.4.6 1.4 1.2 0 .6-.6 1.1-1.5 1.1-.7 0-1.2-.3-1.5-.7-.1-.2-.4-.3-.6-.2l-1.1.4c-.3.1-.4.4-.3.7.5 1.2 1.8 1.9 3.5 1.9 2.1 0 3.5-1.2 3.5-2.9 0-1.3-.8-2.1-2.3-2.5-.8-.2-1.1-.5-1-.9.1-.4.5-.6.9-.6.3 0 .6.1.8.3.1.2.3.2.5.1l1.3-.5c.3-.1.4-.4.2-.6-.5-.7-1.4-1.1-2.5-1.1-1.1 0-1.9.4-2.3 1.1-.2.3 0 .6.3.7l1.2.2Z" />
  </svg>
);

function StatusBar() {
  return (
    <div className="flex items-end justify-between px-5 pb-0.5 pt-1.5 text-[8px] font-semibold tracking-tight text-[#1c2438]">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <svg viewBox="0 0 18 12" className="h-[8px] w-[12px]" aria-hidden>
          <rect x="0" y="7" width="2.2" height="5" rx="0.4" fill={INK} />
          <rect x="3.8" y="5" width="2.2" height="7" rx="0.4" fill={INK} />
          <rect x="7.6" y="3" width="2.2" height="9" rx="0.4" fill={INK} />
          <rect x="11.4" y="1" width="2.2" height="11" rx="0.4" fill={INK} opacity="0.28" />
        </svg>
        <svg viewBox="0 0 14 10" className="h-[8px] w-[11px]" aria-hidden>
          <path d="M1.2 6.4a6.4 6.4 0 0 1 11.6 0" fill="none" stroke={INK} strokeWidth="1.3" />
          <path d="M3.4 8a3.6 3.6 0 0 1 7.2 0" fill="none" stroke={INK} strokeWidth="1.3" />
          <circle cx="7" cy="9.2" r="0.9" fill={INK} />
        </svg>
        <svg viewBox="0 0 22 10" className="h-[8px] w-[18px]" aria-hidden>
          <rect x="0.6" y="0.7" width="17.2" height="8.6" rx="2.2" fill="none" stroke={INK} strokeWidth="1.1" />
          <rect x="2" y="2.1" width="12.2" height="5.8" rx="1.2" fill={NAVY} />
          <rect x="18.4" y="3.1" width="1.6" height="3.8" rx="0.6" fill={INK} />
        </svg>
      </span>
    </div>
  );
}

function AppChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col" style={{ background: CREAM, color: INK }}>
      <StatusBar />
      <header className="flex items-center gap-1 px-2.5 pb-1.5 pt-1">
        <div className="flex min-w-0 items-center gap-1">
          {PIN}
          <span className="font-display text-[11px] font-semibold tracking-tight" style={{ color: NAVY }}>
            KidEase
          </span>
        </div>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[8px]"
          style={{ background: PAPER, color: MUTED, boxShadow: `inset 0 0 0 1px ${LINE}` }}
        >
          EN
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-[8px] font-medium text-white" style={{ background: NAVY }}>
          Sign in
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function TabBar({ active }: { active: "search" | "profile" }) {
  const item = (label: string, on: boolean, icon: ReactNode) => (
    <span className="flex flex-col items-center gap-0.5 text-[7.5px]" style={{ color: on ? NAVY : MUTED }}>
      {icon}
      {label}
    </span>
  );
  return (
    <nav className="grid grid-cols-5 px-1.5 pb-3 pt-1.5" style={{ background: CREAM, borderTop: `1px solid ${LINE}` }}>
      {item(
        "Search",
        active === "search",
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>,
      )}
      {item(
        "Saved",
        false,
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10Z" />
        </svg>,
      )}
      {item(
        "Enrolled",
        false,
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="M9 12.5 11 14.5 15 9.5" />
        </svg>,
      )}
      {item(
        "Messages",
        false,
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 6h14v10H8l-3 3V6Z" />
        </svg>,
      )}
      {item(
        "Profile",
        active === "profile",
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="3" />
          <path d="M6 18c1.4-2.4 3.4-3.5 6-3.5s4.6 1.1 6 3.5" />
        </svg>,
      )}
    </nav>
  );
}

function Storefront({ tall = false, badge = "$10-a-day" }: { tall?: boolean; badge?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg ${tall ? "h-full" : "aspect-[4/3]"}`} style={{ background: "#d4e0f6" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#c3d4f2 0%,#e7eef8 48%,#9eb4d6 100%)" }} />
      <div className="absolute inset-x-3 bottom-2 top-5 rounded-sm" style={{ background: "#8aa0c2" }} />
      <div className="absolute inset-x-6 bottom-2 top-9" style={{ background: "#f4efe6" }} />
      <div className="absolute left-8 right-8 top-11 h-5 rounded-sm" style={{ background: NAVY }} />
      <div className="absolute bottom-2 left-1/2 h-6 w-7 -translate-x-1/2 rounded-t-sm" style={{ background: "#5c6f8c" }} />
      <span className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[7px] font-semibold text-white" style={{ background: NAVY }}>
        {badge}
      </span>
    </div>
  );
}

function Pill({ children, solid = false }: { children: ReactNode; solid?: boolean }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[8px] font-medium"
      style={solid ? { background: NAVY, color: "#fff" } : { background: PAPER, color: INK, boxShadow: `inset 0 0 0 1px ${LINE}` }}
    >
      {children}
    </span>
  );
}

export function ShotHome() {
  return (
    <AppChrome>
      <div className="flex h-full flex-col">
        <div className="flex-1 px-3.5 pt-1">
          <h1 className="font-display text-[17px] leading-[1.15] tracking-tight">
            Find licensed
            <br />
            daycare near you
          </h1>
          <div className="mt-3 flex h-8 items-center justify-center rounded-full text-[10px] font-medium text-white" style={{ background: NAVY }}>
            Use my location
          </div>
          <p className="mt-2 text-center text-[8px]" style={{ color: SUBTLE }}>
            Or enter city or postal code
          </p>
          <div className="mt-1.5 flex h-7 items-center rounded-full px-2.5 text-[9px]" style={{ background: PAPER, color: MUTED, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
            Winnipeg, MB
          </div>
          <div className="mt-1.5 flex h-7 items-center justify-center rounded-full text-[10px] font-medium text-white" style={{ background: NAVY }}>
            Search nearby care
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <Pill>Live listings</Pill>
            <Pill solid>All \u00b7 12</Pill>
          </div>
          <p className="mt-2 text-[8px]" style={{ color: SUBTLE }}>
            Winnipeg \u00b7 15 km
          </p>
          <h2 className="mt-1 font-display text-[13px]">Daycares available</h2>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Storefront />
            <Storefront />
          </div>
        </div>
        <TabBar active="search" />
      </div>
    </AppChrome>
  );
}

export function ShotSearch() {
  return (
    <AppChrome>
      <div className="flex h-full flex-col">
        <div className="px-2.5 pb-1.5">
          <div className="flex h-7 items-center rounded-full px-2.5 text-[9px]" style={{ background: PAPER, color: SUBTLE, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
            Address, city, or postal code
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="flex h-6 flex-1 items-center justify-center rounded-full text-[8px] font-medium text-white" style={{ background: NAVY }}>
              Search
            </span>
            <span
              className="flex h-6 items-center rounded-full px-2 text-[8px] font-medium"
              style={{ color: NAVY, background: PAPER, boxShadow: `inset 0 0 0 1px ${NAVY}` }}
            >
              15 km
            </span>
            <span className="flex overflow-hidden rounded-full text-[8px] font-medium" style={{ boxShadow: `inset 0 0 0 1px ${LINE}` }}>
              <span className="px-2 py-1 text-white" style={{ background: NAVY }}>
                List
              </span>
              <span className="px-2 py-1" style={{ background: PAPER, color: MUTED }}>
                Map
              </span>
            </span>
          </div>
        </div>
        <div className="relative min-h-0 flex-1" style={{ background: "#dce6f6" }}>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 62% 38%, #c9d8f2 0%, transparent 52%), linear-gradient(180deg,#e4ecf8 0%,#c3d2ea 100%)",
            }}
          />
          <span
            className="absolute left-[58%] top-[36%] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: NAVY, boxShadow: "0 0 0 6px rgba(26,55,144,0.22)" }}
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl px-3 pb-2 pt-2" style={{ background: PAPER, boxShadow: "0 -10px 24px -16px rgba(26,55,144,0.35)" }}>
            <div className="mx-auto mb-1.5 h-1 w-8 rounded-full" style={{ background: LINE }} />
            <p className="text-center text-[11px] font-semibold">462 centres · 16 km</p>
            <div className="mt-1.5 h-24 overflow-hidden rounded-xl">
              <Storefront tall badge="Licensed" />
            </div>
          </div>
        </div>
        <TabBar active="search" />
      </div>
    </AppChrome>
  );
}

export function ShotListing() {
  return (
    <AppChrome>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-2">
          <div className="h-[108px] overflow-hidden rounded-xl">
            <Storefront tall />
          </div>
          <p className="mt-1.5 text-[8px]" style={{ color: MUTED }}>
            123 Osborne St, Winnipeg, MB
          </p>
          <h1 className="mt-0.5 font-display text-[14px] leading-tight tracking-tight">River Heights Child Care</h1>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Pill solid>Licensed</Pill>
            <Pill solid>$10-a-day</Pill>
            <Pill>Live</Pill>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px]">
            {[
              ["Hours", "7:30 \u2013 5:30"],
              ["Ages", "12\u201360 months"],
              ["Licence", "MB-1184"],
              ["Open spots", "3"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg px-2 py-1.5" style={{ background: PAPER, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
                <p className="text-[7px]" style={{ color: SUBTLE }}>
                  {k}
                </p>
                <p className="mt-0.5 font-medium">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-1.5 rounded-lg px-2 py-1.5" style={{ background: PAPER, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
            <p className="text-[8px]" style={{ color: SUBTLE }}>
              Monthly parent fees from
            </p>
            <p className="font-display text-[16px] tabular-nums">
              $10<span className="text-[10px]" style={{ color: MUTED }}>
                /day
              </span>
            </p>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <div className="flex h-7 items-center justify-center rounded-full text-[9px] font-medium" style={{ background: "#eee8df" }}>
              Book a tour
            </div>
            <div className="flex h-7 items-center justify-center rounded-full text-[9px] font-medium text-white" style={{ background: NAVY }}>
              Request a spot
            </div>
          </div>
        </div>
        <TabBar active="search" />
      </div>
    </AppChrome>
  );
}

export function ShotLogin() {
  return (
    <AppChrome>
      <div className="flex h-full flex-col px-3 pb-3 pt-1">
        <div className="flex flex-1 flex-col rounded-2xl px-3.5 py-3.5" style={{ background: PAPER, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
          <div className="mx-auto">{PIN}</div>
          <p className="mt-1 text-center font-display text-[12px]">KidEase</p>
          <h1 className="mt-2.5 font-display text-[18px] tracking-tight">Sign in</h1>
          <p className="mt-1 text-[8px] leading-snug" style={{ color: MUTED }}>
            Save centres, request a spot, and message educators.
          </p>
          <div className="mt-3 flex h-7 items-center justify-center rounded-full text-[9px] font-medium text-white" style={{ background: INK }}>
            Sign in with Apple
          </div>
          <div className="mt-1.5 flex h-7 items-center justify-center rounded-full text-[9px]" style={{ background: PAPER, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
            Continue with Google
          </div>
          <div className="mt-1.5 flex h-7 items-center justify-center rounded-full text-[9px]" style={{ background: PAPER, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
            Continue with X
          </div>
          <p className="mt-2.5 text-center text-[7px] uppercase tracking-[0.14em]" style={{ color: SUBTLE }}>
            or use email
          </p>
          <p className="mt-2 text-[8px] font-medium">Email</p>
          <div className="mt-1 h-6 rounded-xl" style={{ boxShadow: `inset 0 0 0 1px ${LINE}` }} />
          <p className="mt-1.5 text-[8px] font-medium">Password</p>
          <div className="mt-1 h-6 rounded-xl" style={{ boxShadow: `inset 0 0 0 1px ${LINE}` }} />
          <div className="mt-2.5 flex h-7 items-center justify-center rounded-full text-[9px] font-medium text-white" style={{ background: NAVY }}>
            Sign in
          </div>
        </div>
      </div>
    </AppChrome>
  );
}
