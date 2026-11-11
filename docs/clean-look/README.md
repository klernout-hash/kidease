# Clean look

A calmer, whiter look for the whole product: guest pages, the parent desk, the daycare desk, the admin desk, and the government desk. It changes colours, corners, and shadows. On the website it also gives the home page a taller header with a larger logo and the care picture tabs. It does not change copy, features, or the logo artwork.

Today's look is still the default. Do not change the default until Kyle says so.

## Try it

- Open any page with `?look=clean`. This device keeps the choice.
- Open any page with `?look=classic` to go back.
- Light, Dark, and System in Appearance all work with it.

## How it works

- `public/look-boot.js` reads the choice and sets `data-look="clean"` on `<html>` before the first paint.
- `src/styles.css` ends with a block scoped to `html[data-look="clean"]`. It replaces the shared colour, corner, and shadow tokens for light and dark.
- Every screen that uses the shared tokens picks the look up with no other change.

## Going live and going back

- Go live: change `DEFAULT_LOOK` in `public/look-boot.js` from `classic` to `clean`, and raise the `v` number on its script tag in `src/routes/__root.tsx`.
- Go back: change it back, or revert that commit. The branch `backup/pre-visual-redesign` holds the site as it was before this work.

## Tokens

| Token | Light | Dark |
| --- | --- | --- |
| Page `--color-bg` | `#ffffff` | `#14161c` |
| Card `--color-surface` | `#ffffff` | `#1c1f26` |
| Soft fill `--color-surface-2` | `#f7f7f7` | `#272b34` |
| Text `--color-fg` | `#222222` | `#f5f5f7` |
| Quiet text `--color-muted` | `#6a6a6a` | `#b4bac6` |
| Brand `--color-primary` | `#1a3790` | `#9db5f5` |
| Accent `--color-accent` | `#b45309` | `#f2ab6b` |
| Line `--color-border` | `#e4e4e4` | `#343a46` |
| Good `--color-ok` | `#166534` | `#5cc296` |
| Problem `--color-danger` | `#b42318` | `#f28b82` |

Corners: 8px small parts, 12px buttons and fields, 16px cards, 20px listing photos and large sheets, full pills for chips.

## Rules for every new screen and pull request

1. Use the token classes: `bg-bg`, `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `border-border`, `bg-primary`, `text-primary-fg`, `shadow-card`.
2. Do not write a hex colour, `bg-white`, or a `stone`, `slate`, `gray`, `amber`, or `emerald` class in a component. A screen that does will not follow the look or dark mode.
3. Use the radius classes `rounded-md`, `rounded-lg`, `rounded-xl`, and `rounded-full`. Do not write a pixel radius.
4. Use `.ke-input` and `.ke-textarea` for fields and `Button` from `src/components/ui/button.tsx` for buttons.
5. Check the screen at 390px and 1280px, in light and dark, with `?look=clean` and with `?look=classic`.
6. Text contrast stays at 4.5 to 1 or better in both themes.
7. No new animation without Kyle's approval of a draft.

## Known gaps

Screens that still use fixed colours are listed in the pull request that adds this file. They keep working. They follow the look once they move to the tokens.
