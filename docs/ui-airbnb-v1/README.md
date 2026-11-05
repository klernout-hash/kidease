# FEATURE_UI_AIRBNB_V1

Phone shell. Default **off**. Do not turn this on in Vercel until Kyle says so.

Flag off: the `data-ui` attribute is omitted and the new nodes are not rendered. Desktop stays on today’s layout even when the flag is on. Admin and gov are not restyled.

What the flag turns on, under 768px:

- Home: search pill (the existing Where / When / Who sheet when `FEATURE_MOBILE_SEARCH_V2` is also on), honest filter chips, a sideways card rail. No street for a home daycare. No “spots left”. A fee is not shown.
- Tabs: Explore, Saved, Messages, Menu. The bell stays off the tab bar. Daycare and admin tabs stay as they are.
- Menu: profile row, account hub, globe with the current language.
- Account: personal info inline edit (existing profile save), login and security, privacy, notifications, languages, receipts only, accessibility, legal, log out.
- Notifications: Alerts and Account tabs. Edit opens the existing alert choices. Texts stay limited to people who already opted in.
- Daycare page: one photo, the name, a freshness line when we have one, and one button (Message or Request a tour).

Languages you add are stored on this device only. There is no automatic message translation, so that toggle is not shown.

## Pass / fail

| Check | Result |
| --- | --- |
| Flag default off, and off leaves today’s screens alone | Pass |
| Desktop layout unchanged when the flag is on | Pass |
| Home pill, chips, and cards under 768px | Pass |
| No home-daycare street on the new card | Pass |
| No subscribe, upgrade, or pay button in the hub | Pass |
| No new API, schema, or paid place lookup | Pass |
| Bell stays the alert list; settings stay in Menu | Pass |
| EN and FR-CA copy for the new screens | Pass |
| Automatic translation toggle | Not built — chat translation does not exist |
| $10-a-day chip | Not shown — there is no honest filter for it |
| Messages declutter | Not changed, so it cannot regress |
| Admin and gov chrome | Unchanged |
