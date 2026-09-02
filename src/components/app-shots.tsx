import type { ReactNode } from "react";

const PIN = (
  <svg viewBox="0 0 32 40" className="h-7 w-6" aria-hidden>
    <path fill="#2563eb" d="M16 0c8.3 0 15 6.6 15 14.7 0 10.2-12.4 23.5-14.4 25.1a.9.9 0 0 1-1.2 0C13.4 38.2 1 24.9 1 14.7 1 6.6 7.7 0 16 0Z" />
    <circle cx="16" cy="14.2" r="7.2" fill="#fff" />
    <path fill="#2563eb" d="M12.2 13.4c.3-1.6 1.6-2.6 3.3-2.6 1.2 0 2 .4 2.6 1.1.2.3 0 .6-.3.7l-1.3-.2c-.2 0-.4-.2-.5-.4-.2-.3-.6-.5-1.1-.5-.8 0-1.4.6-1.6 1.5-.2 1 .3 1.8 1.4 2.1.9.2 1.4.6 1.4 1.2 0 .6-.6 1.1-1.5 1.1-.7 0-1.2-.3-1.5-.7-.1-.2-.4-.3-.6-.2l-1.1.4c-.3.1-.4.4-.3.7.5 1.2 1.8 1.9 3.5 1.9 2.1 0 3.5-1.2 3.5-2.9 0-1.3-.8-2.1-2.3-2.5-.8-.2-1.1-.5-1-.9.1-.4.5-.6.9-.6.3 0 .6.1.8.3.1.2.3.2.5.1l1.3-.5c.3-.1.4-.4.2-.6-.5-.7-1.4-1.1-2.5-1.1-1.1 0-1.9.4-2.3 1.1-.2.3 0 .6.3.7l1.2.2Z" />
  </svg>
);

function AppChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-[#f6f3ee] text-[#1c2438]">
      <header className="flex items-center gap-2 px-3 pb-2 pt-7">
        <div className="flex min-w-0 items-center gap-1">
          {PIN}
          <span className="font-display text-[11px] font-semibold tracking-tight">KidEase</span>
        </div>
        <span className="ml-auto rounded-full bg-[#fffcf8] px-3 py-1 text-[9px] text-[#5c6578] ring-1 ring-[#e3ddd3]">
          English
        </span>
        <span className="grid size-6 place-items-center text-[#1c2438]" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function TabBar({ active }: { active: "search" | "profile" }) {
  const item = (label: string, on: boolean, icon: ReactNode) => (
    <span className={`flex flex-col items-center gap-0.5 text-[8px] ${on ? "text-[#1a3790]" : "text-[#5c6578]"}`}>
      {icon}
      {label}
    </span>
  );
  return (
    <nav className="grid grid-cols-5 border-t border-[#e3ddd3] bg-[#f6f3ee] px-2 py-2">
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

function Storefront({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[#d9e3f5] ${tall ? "h-full" : "aspect-square"}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#c5d4ee] via-[#e8eef6] to-[#b7c6dc]" />
      <div className="absolute inset-x-3 bottom-2 top-6 rounded-sm bg-[#8fa0b8]" />
      <div className="absolute inset-x-6 bottom-2 top-10 bg-[#f4efe6]" />
      <div className="absolute left-8 right-8 top-12 h-6 rounded-sm bg-[#1a3790]" />
      <div className="absolute bottom-2 left-1/2 h-7 w-8 -translate-x-1/2 rounded-t-sm bg-[#5c6f8c]" />
      <span className="absolute left-1.5 top-1.5 rounded-full bg-[#1a3790] px-1.5 py-0.5 text-[7px] font-semibold text-white">
        $10-a-day
      </span>
    </div>
  );
}

export function ShotHome() {
  return (
    <AppChrome>
      <div className="flex h-full flex-col">
        <div className="flex-1 px-3.5 pt-2">
          <h1 className="font-display text-[18px] leading-[1.15] tracking-tight">
            Find licensed
            <br />
            daycare near you
          </h1>
          <div className="mt-3 flex h-9 items-center justify-center rounded-full bg-[#1a3790] text-[11px] font-medium text-white">
            Use my location
          </div>
          <p className="mt-2.5 text-center text-[9px] text-[#8a847a]">Or enter city or postal code</p>
          <div className="mt-2 flex h-8 items-center rounded-full bg-[#fffcf8] px-2.5 text-[10px] text-[#5c6578] ring-1 ring-[#e3ddd3]">
            Winnipeg, MB
          </div>
          <div className="mt-2 flex h-8 items-center justify-center rounded-full bg-[#1a3790] text-[11px] font-medium text-white">
            Search
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="rounded-full bg-[#fffcf8] px-2 py-1 text-[9px] ring-1 ring-[#e3ddd3]">Live Listings</span>
            <span className="rounded-full bg-[#1c2438] px-2 py-1 text-[9px] text-white">All listings · 12</span>
          </div>
          <p className="mt-2 text-[9px] text-[#8a847a]">Winnipeg · 15.5 mi</p>
          <h2 className="mt-2 font-display text-[14px]">Daycares available</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
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
        <div className="px-3 pb-2">
          <div className="flex h-8 items-center rounded-full bg-[#fffcf8] px-2.5 text-[10px] text-[#8a847a] ring-1 ring-[#e3ddd3]">
            Address, city, or postal code
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-[#ebe6dc]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_40%,#d7e0ee,transparent_55%),linear-gradient(#e8e4da,#dcd6cb)]" />
          <div className="absolute right-2 top-2 flex overflow-hidden rounded-full text-[8px] font-medium ring-1 ring-[#e3ddd3]">
            <span className="bg-[#1a3790] px-2 py-1 text-white">Map</span>
            <span className="bg-[#fffcf8] px-2 py-1 text-[#5c6578]">Satellite</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-[#fffcf8] px-3 pb-2 pt-2 shadow-[0_-8px_24px_-16px_rgba(28,36,56,0.35)]">
            <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-[#e3ddd3]" />
            <p className="text-center text-[11px] font-semibold">462 centres · 16 mi</p>
            <div className="mt-2 h-28 overflow-hidden rounded-xl">
              <Storefront tall />
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
          <div className="h-[118px] overflow-hidden rounded-xl">
            <Storefront tall />
          </div>
          <p className="mt-2 text-[8px] text-[#5c6578]">123 Osborne St, Winnipeg, MB</p>
          <h1 className="mt-0.5 font-display text-[15px] leading-tight tracking-tight">River Heights Child Care</h1>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded-full bg-[#1a3790] px-1.5 py-0.5 text-[7px] font-semibold text-white">Licensed</span>
            <span className="rounded-full bg-[#1a3790] px-1.5 py-0.5 text-[7px] font-semibold text-white">$10-a-day</span>
            <span className="rounded-full bg-[#fffcf8] px-1.5 py-0.5 text-[7px] ring-1 ring-[#e3ddd3]">Live</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px]">
            {[
              ["Hours", "7:30 – 5:30"],
              ["Ages", "12–60 months"],
              ["Licence", "MB-1184"],
              ["Open spots", "3"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-[#fffcf8] px-2 py-1.5 ring-1 ring-[#e3ddd3]">
                <p className="text-[7px] text-[#8a847a]">{k}</p>
                <p className="mt-0.5 font-medium">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-[#fffcf8] px-2 py-1.5 ring-1 ring-[#e3ddd3]">
            <p className="text-[8px] text-[#8a847a]">Monthly parent fees from</p>
            <p className="font-display text-[16px] tabular-nums">
              $10<span className="text-[10px] text-[#5c6578]">/day</span>
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="flex h-7 items-center justify-center rounded-full bg-[#eee8df] text-[9px] font-medium">
              Book a tour
            </div>
            <div className="flex h-7 items-center justify-center rounded-full bg-[#1a3790] text-[9px] font-medium text-white">
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
        <div className="flex flex-1 flex-col rounded-2xl bg-[#fffcf8] px-3.5 py-4 ring-1 ring-[#e3ddd3]">
          <div className="mx-auto">{PIN}</div>
          <p className="mt-1 text-center font-display text-[13px]">KidEase</p>
          <h1 className="mt-3 font-display text-[20px] tracking-tight">Sign in</h1>
          <p className="mt-1 text-[9px] leading-snug text-[#5c6578]">Save centres, request a spot, and message educators.</p>
          <div className="mt-3 flex h-8 items-center justify-center rounded-full bg-[#1c2438] text-[10px] font-medium text-white">
            Sign in with Apple
          </div>
          <div className="mt-1.5 flex h-8 items-center justify-center rounded-full bg-[#fffcf8] text-[10px] ring-1 ring-[#e3ddd3]">
            Continue with Google
          </div>
          <div className="mt-1.5 flex h-8 items-center justify-center rounded-full bg-[#fffcf8] text-[10px] ring-1 ring-[#e3ddd3]">
            Continue with X
          </div>
          <p className="mt-3 text-center text-[8px] uppercase tracking-[0.14em] text-[#8a847a]">or use email</p>
          <p className="mt-2 text-[9px] font-medium">Email</p>
          <div className="mt-1 h-7 rounded-xl ring-1 ring-[#e3ddd3]" />
          <p className="mt-2 text-[9px] font-medium">Password</p>
          <div className="mt-1 h-7 rounded-xl ring-1 ring-[#e3ddd3]" />
          <div className="mt-3 flex h-8 items-center justify-center rounded-full bg-[#1a3790] text-[10px] font-medium text-white">
            Sign in
          </div>
        </div>
      </div>
    </AppChrome>
  );
}
