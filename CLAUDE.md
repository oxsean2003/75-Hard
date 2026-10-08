# CLAUDE.md — 75 Hard app (project memory)

Hebrew RTL, phone-first PWA for the user's personal 75 Hard rule set. Vanilla HTML/CSS/JS, **no build step, no backend, no dependencies**. Data lives only on the device (localStorage state + IndexedDB photos). See [README.md](README.md) for features, deploy and layout.

## Decisions (user-confirmed)
- Hosting: **GitHub Pages, public repo** (free account). User chose this over Netlify so pushes auto-deploy.
- **Privacy:** the repo is public, so the wording of the two personal rules (daily rule #2, weekly-limited rule #3) must NEVER appear in code, data or docs. Only the neutral labels live in `Day.newState().settings.ruleNames`; the user renames them on-device in Settings. Verify with a grep before any publish.
- Start date is chosen by the user (never "first open"). Day ends via the **"סיים את היום"** button; fallback auto-close at `settings.cutoffHour` (default 05:00).
- A missed item → **warn, allow fixing a mis-tap, user confirms** the restart. Never reset silently. Best streak + failed attempts kept (`state.best`, `state.history`).
- **Round 2 (after first real use):** negative rules are NOT checkmarks and NOT tracked (honor system) — they live as reminders (Today's collapsible "כללים לזכור" card + Rules tab). The weekly-limited rule was removed entirely (no counter). Reading is a single checkmark (no pages/book). A manual "restart from Day 1" (`Day.manualRestart`, Settings→backup tab) replaces rule-slip tracking; new Day 1 = tomorrow.
- Workouts are interchangeable: `Schedule.planFor` resolves day override (`day.wN.plan`) > `settings.weekPlan[weekday]` > calendar default. Today has "החלף אימון"; "עוד ← תוכנית אימונים" edits the weekly plan.
- Workout gap default 3 h (source doc says 3–4 h); setting offers 3 / 3.5 / 4.
- iOS web apps can't push-notify while closed → in-app banners + a generated list for iOS Reminders (`js/reminders.js`).

## Architecture notes
- `js/day.js` is pure logic with the clock passed in (`now` ms) — all lifecycle rules live there and are covered by `tests/tests.html` (run it after ANY change to day.js/store.js/reminders.js; must show `0 failed`).
- Logical day = cutoffHour→cutoffHour; computed from LOCAL hour (not ms math) so DST can't shift it.
- Views render HTML strings; interactions use `data-act` / `data-change` delegation registered with `App.act(name, fn)`. Escape every user-provided string with `App.esc`.
- `App.state` is replaced wholesale on backup restore/reset — views must read `app.state` live, never cache it.
- Photos: downscaled to ≤1600 px JPEG, keyed by day key; backup embeds them as data URLs.
- `sw.js`: same-origin network-first (fresh when online, cached offline); the precache `SHELL` must list every file the app loads (one 404 breaks offline install) — update it and bump `CACHE` when adding files.

## Gotchas learned the hard way
- **Saves outlive releases.** Real users hold data from older versions. `Store.normalize` must merge defaults into a *fresh copy of the defaults* (not into the saved object) so settings added later exist on old saves, and any removed/renamed field needs a migration there. Add a test with a save shaped like the *previous release*, not just an empty one.
- **`tests/tests.html` is deployed and shares an origin with the app.** Tests must never touch the real `localStorage`: storage tests use `Store.useBackend(fakeStorage)`; a test asserts the real `75hard:*` keys are unchanged. Never add a test that writes/removes real keys.
- The browser pane is Chromium: it cannot reproduce iOS-Safari-only layout bugs (e.g. date inputs ignoring `width`). Apply the known CSS fix, check no overflow, and have the user confirm on the iPhone.

- **Deploy lag:** GitHub Pages serves `Cache-Control: max-age=600`, so a plain `fetch()` in the service worker can hand the phone files up to 10 min stale. The SW therefore fetches same-origin with `{cache:'no-cache'}` (ETag revalidation) and registers with `updateViaCache:'none'`. **Every release: bump `CACHE` in `sw.js` AND `App.version` in `js/app.js`** (shown in עוד, with a "בדיקת עדכון עכשיו" button that clears the app-file cache and reloads — never the user's data).

## Conventions
- Hebrew UI strings; mixed text gets `dir="auto"`. Color via CSS variables in `css/app.css`.
- Verify UI changes in the browser pane (phone width) — `.claude/launch.json` serves on :8765. Test hooks: `App.offset` shifts the clock (ms).
- Not built / ideas: routine timers with phases (A/B/C are guide text only), optional free push (e.g. ntfy.sh).
