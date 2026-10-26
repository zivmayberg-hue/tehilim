# Теилим для семьи

A family page showing each family member's Tehillim chapter by Hebrew age, plus a daily reminder message. Private and operational notes (who uses it, sending setup, roadmap) are in `CLAUDE.local.md`, which is never committed.

## Files
- `index.html` is the whole site (single file, the Psalms text is embedded), served by GitHub Pages from main, root folder. `og.jpg` and `apple-touch-icon.png` are the share preview and home-screen icon. `.nojekyll` turns off Jekyll.
- Search engines: the page is kept out of search results by the noindex tags in `index.html` only. `robots.txt` in this repository is not at the domain root (the site is served under a subpath), so crawlers never read it; it protects nothing.
- `notify/notify.js` builds and sends the reminders; `.github/workflows/notify.yml` runs it daily at 04:00 UTC (08:00 Dubai) and installs `@hebcal/core` 5.8.0 at runtime.
- The family list (`PEOPLE`) lives only in `index.html`; `notify.js` reads it from there.
- `notify/sent.log` records sent reminders, prevents duplicate sends and keeps the GitHub schedule active. The workflow commits it to main, so always `git pull --rebase` before committing.
- `tests/` holds dev-only tests (see Tests). Nothing in it is loaded by the site or the workflow.

## Calendar rules (do not change without asking the user)
- The Hebrew day changes at sunset.
- Chapter = Hebrew age + 1.
- Birthday rules as in Hebcal: Adar of a non-leap year and Adar II go to the last Adar; Adar I stays Adar I (plain Adar in non-leap years); 30 Cheshvan, 30 Kislev and 30 Adar I move to the 1st of the next month when that day doesn't exist.
- Diaspora holidays. Fasts are moved off Shabbat as in Hebcal. Rosh Chodesh is announced once, on its first day.

## Location rules
- Anything location-based on the page (sunset switch, Shabbat and holiday times) must follow the city of the phone's time zone and show that city's name; never assume a fixed city on the page.
  - Known gap: the page's sunset switch already follows the phone's time zone (`CITIES` in `index.html`), but the page does not show the city name yet.
- The reminders are different: the morning check runs on Dubai time, and the Shabbat block always lists the five fixed cities: Dubai, Herzliya, Bucharest, Kyiv, Chernivtsi.

## Reminder rules
- One message per morning, only when something starts that evening (birthday, Rosh Chodesh, holiday, fast, Shabbat).
- Never post on Shabbat or Yom Tov (diaspora); announce on the last weekday before instead.
- Shabbat block every Friday: candle lighting 18 minutes before sunset, havdalah at 8.5 degrees; weekly portion in Russian with Hebrew, plus a note when Israel reads a different portion.
- Sending goes to WhatsApp or Telegram depending on repository settings; if WhatsApp fails, the message falls back to Telegram. Details in `CLAUDE.local.md`.

## Design rules
- Russian UI, very large text with the "Крупнее" button, warm gold and iOS glass style, one obvious button per card.
- Must work in light and dark mode on iPhone and iPad (two columns on iPad).
- Hebrew text with nikud, no cantillation marks; words joined by a maqaf never break across lines.

## Writing rules for messages
- Plain spoken Russian, no em dashes, never decline personal names in templates (use "имя: ..." constructions instead).
- Don't copy third-party texts (e.g. Chabad.org) into messages; link to them instead.

## Workflow
- Run all commands yourself; only ask the user to approve, sign in or paste a token.
- Before every publish, run the tests and show the result. Never change `index.html` or `notify.js` without running them.
- Never print secrets in full.

### The site and reminders are live: never publish untested changes to main
The website and the reminders are used by the family every day. Pushing to main publishes immediately (GitHub Pages serves `index.html` from main; the daily workflow runs `notify/notify.js` from main). Therefore:
- Never push changes to `index.html`, `og.jpg`, `apple-touch-icon.png`, `notify/notify.js` or `.github/workflows/` directly to main.
- Do all such work on a separate branch.
- Website changes: publish the branch to the preview site for review: the separate public repository `tehilim-preview` on the same account (GitHub Pages on, main branch, root), containing the same site files (`index.html`, `og.jpg`, `apple-touch-icon.png`, `.nojekyll`) plus a `robots.txt` that disallows all crawlers; `index.html` keeps the same noindex tags. Never put `notify/` or `.github/workflows/` in the preview repository (the reminder would run twice). Give the user the preview link and screenshots at iPhone and iPad size, light and dark.
- Reminder changes: show dry-run messages for representative dates instead (run `notify/notify.js` locally with `TODAY=YYYY-MM-DD DRY_RUN=1 TZ=Asia/Dubai` and `NODE_PATH=tests/node_modules`).
- Merge to main only after the user writes "approved" for that specific change. After merging, confirm the live files are byte-identical to what was approved.
- Changes to `CLAUDE.md`, `.gitignore` and `tests/` alone may go to main directly, since they don't affect what the family sees.

## Tests
Run all tests with one command from the repository root:

```bash
tests/run.sh
```

`tests/run.sh page` (or any part of a file name) runs a single group. The first run installs the pinned test-only packages (`@hebcal/core` 5.8.0, `playwright` 1.63.0 and headless Chromium) into `tests/node_modules`, which is git-ignored.

- `birthdays.test.js`: every family member, every day from today to 2046: the page's chapter, "birthday today" and next birthday match Hebcal.
- `holidays.test.js`: every day to 2036: `notify.js` holidays and Rosh Chodesh match Hebcal (diaspora); "(observed)" fasts count as matches.
- `reminders.test.js`: every morning to 2036: each event announced exactly once, before it starts, never on Shabbat or Yom Tov; no em dashes or missing times in messages.
- `shabbat.test.js`: every Saturday to 2036: times for all five cities and a translated portion, with the Israel note exactly when Israel reads differently.
- `page.test.js`: `index.html` in headless Chromium at iPhone and iPad sizes, light and dark, in Dubai, Jerusalem and Bucharest on test dates; clicks every button; checks no errors, no sideways scrolling, chapters vs Hebcal, two columns on iPad, nikud without cantillation, maqaf kept together, no requests except Google Fonts, and the sunset switch at the phone's own city.
