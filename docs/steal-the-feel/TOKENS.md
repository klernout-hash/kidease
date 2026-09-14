# KidEase steal-the-feel tokens (proposal)

Not wired into production. Current theme lives in `src/styles.css` `@theme` and `src/lib/theme.ts` (`THEME_COLOR_LIGHT = "#1A3790"`).

Machine files in this folder:

- [`tokens.css`](./tokens.css) — proposed `@theme` block (copy into `src/styles.css` in a follow-up).
- [`tokens.ts`](./tokens.ts) — same values as a TS export (optional import later).

## Brand

| Name | Value | Use |
| --- | --- | --- |
| Primary | `#1A3790` | Buttons, links, map pin, theme-color, focus ring |
| Primary fg | `#FFFFFF` | Text on primary |
| Soft | `#EEF2FB` | Hero wash, chip track, selected chip fill at 100%, map halo |
| Soft strong | `#D5DFF3` | Chip border / hover on soft |
| FG | `#1C2438` | Titles, prices (keep today’s `--color-fg`) |
| Muted | `#5C6578` | Subcopy, km, hours |
| Border | `#E3DDD3` | Hairline only — do not stack on the card shadow |
| OK | `#1A7A5A` | Open spots (honest vacancy only) |
| Danger | `#B42318` | Errors, not marketing |

Dark appearance already shifts primary to `#6D89D8` in `src/styles.css`. Do not invent a second dark navy.

## Spacing — 8pt grid

All gaps, padding, and control heights snap to 8px.

| Step | px | rem | Typical |
| ---: | ---: | ---: | --- |
| 1 | 8 | 0.5 | Chip gap, thumb gap |
| 2 | 16 | 1 | Card padding, section inset |
| 3 | 24 | 1.5 | Card-to-card, fact row |
| 4 | 32 | 2 | Section break (tight) |
| 6 | 48 | 3 | Section break (home) |
| 8 | 64 | 4 | Hero padding (desktop) |

Control height: **48px** (`h-12` / `min-h-12`) for Search, Enquire, Request a tour. 44px is the floor (`RESPONSIVE.md`).

Page gutter stays `ke-gutter`. Do not add a second container width. Home / listing max `max-w-6xl`; search list+map may use `max-w-7xl`.

## Radius — one value

**14px** (`--radius-md` today). Use it for cards, search field, listing gallery, sticky CTA card, dialogs.

| Allowed | px | Why |
| --- | ---: | --- |
| **Radius** | 14 | The one card / field / panel corner |
| Pill | 999px | Chips, Sign in, Map/List toggle only |

Drop `--radius-xs` / `sm` / `lg` / `xl` / `device` from new work. Existing `rounded-xl` (22px) on listing panels should move to 14px in the apply PR.

## Shadow — one value

```css
--shadow-card: 0 1px 0 rgba(28, 36, 56, 0.04), 0 18px 40px -24px rgba(26, 55, 144, 0.28);
```

That is today’s `--shadow-card`. **Do not use `--shadow-lift`** on new Home / Search / Listing work. Hover may raise opacity of the same shadow, not a second recipe.

Dark: keep the existing dark `--shadow-card` (black, not navy).

## Type — one scale

Family: **Plus Jakarta Sans** (already `@font-face` in `src/styles.css`). No second display face.

| Role | Size | Line | Weight | Use |
| --- | ---: | ---: | ---: | --- |
| Display | 40 / 32 / 28 | 1.15 | 600 | Home H1 (clamp 28–40) |
| Title | 24 | 1.2 | 600 | Listing H1, search city H1 |
| Section | 20 | 1.25 | 600 | About, facts heading |
| Body | 16 | 1.5 | 400 | Subcopy, about |
| Meta | 14 | 1.4 | 500 | km, ages, hours, chips |
| Tiny | 12 | 1.3 | 600 | Trust chip, photo index |

Tracking: display / title `-0.03em` (matches today’s search H1). Body 0.

Do not add `text-[1.65rem]` / `text-[clamp(2rem,6vw,3.25rem)]` one-offs. New work uses the ramp (Tailwind: `text-display`, `text-title`, … once the apply PR maps them).

## Component recipes (feel, not pixels)

**Search field (home + search)**

- Height 48–56px, radius 14, white surface, 1px border or the one shadow — not both.
- Left: pin icon. Mid: “City or postal code”. Right: primary Search (icon or pill).
- One primary only.

**Trust / filter chips**

- Pill, 14px type, 8px / 16px padding, min height 44.
- Off: soft `#EEF2FB` or white + border. On: primary or soft-strong.
- Sticky on Search; wrap on phone (no page-level horizontal overflow).

**Listing card**

- Photo `aspect-[4/3]`, radius 14, overflow hidden.
- Real still or a single labelled pending state — not a grey void.
- Name 16–20 semibold. Meta 14. Price tabular-nums.

**Listing sticky CTA**

- Desktop: 14 radius, one shadow, fee + spots + Enquire + Request a tour.
- Mobile: full-width bar, two buttons 50/50, safe area, no third primary.

## Apply later (not this PR)

1. Add `--color-soft` and the type-size tokens in `src/styles.css`.
2. Alias `--radius-*` used by Home / Search / Listing to 14px.
3. Stop using `--shadow-lift` on those three pages.
4. Import `tokens.ts` only if a component needs the hex in JS (map pin already hard-codes `#1A3790`).
