# 75 הארד — checklist + guide

A Hebrew, right-to-left web app for the 75 Hard challenge. Installs on an iPhone home screen (also works in a desktop browser). No server, no accounts, no build step: static files only. **All data and photos stay on the device** (localStorage + IndexedDB).

## What it does
- Daily checklist of the things you *do*: 3 meals, two 45-minute workouts (≥1 outdoors, enforced gap), 3.8 L water, reading ✓, progress photo. The negative rules (no snacking/sugar/alcohol, phone-free windows, personal rules) are **honor-system reminders** — a collapsible "כללים לזכור" card on Today and the Rules page — not checkmarks. Slipped? **עוד ← הגדרות/גיבוי ← התחל מחדש מיום 1**.
- Workouts are interchangeable: swap a session for the day on Today ("החלף אימון", or type your own), and set your default session for each weekday under **עוד ← תוכנית אימונים**.
- You choose the start date. Press **"סיים את היום"** when you go to sleep; if you forget, the day closes automatically at 05:00 (configurable).
- A missed item never resets silently: you get a warning, can fix a mis-tap, and only a confirmation restarts from Day 1. Best streak and every failed attempt are kept.
- Workout timers, meal guide (logs meals to the checklist), 7-day training calendar, 45-minute routines, exercise library, rules page.
- Progress: photo grid, side-by-side compare, slideshow, weekly weight/waist charts, reading log, milestone screens (days 7/25/50/75).
- Backup/restore (full with photos, or data only) and an in-app reminders list for iOS Reminders.

## Publish on GitHub Pages (free; needs a **public** repo on a free account)
The code is public, so the two personal rules ship with neutral names ("כלל אישי 2/3"). Rename them in the app's Settings; the names stay on your phone only.

1. Create an empty repo on github.com (e.g. `75-hard`). Don't add a README/license.
2. In this folder:
   ```bash
   git remote add origin https://github.com/<your-user>/75-hard.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save.**
4. After a minute the site is live at `https://<your-user>.github.io/75-hard/`.
5. Every later `git push` updates the site. The app fetches fresh files when online, so just reopen it.

## Install on iPhone
1. Open the Pages URL in **Safari** (not an in-app browser).
2. Share → **Add to Home Screen**. Open it from the home-screen icon from then on.
3. In the app: **עוד → גיבוי → גיבוי מלא** now and then, and after any milestone.

## Limits worth knowing
- iPhone web apps can't send notifications while closed (no server). Reminders show inside the app; **עוד → הגדרות** lists times to create in iOS Reminders.
- Workout timers store timestamps, so they stay accurate when the phone locks, but can't ring while locked.
- Clearing Safari website data (or deleting the home-screen app) erases everything. Back up.

## Develop
```bash
python -m http.server 8765      # then open http://localhost:8765
```
Tests (pure logic: day lifecycle, rules, backup, reminders): open `http://localhost:8765/tests/tests.html` — the heading shows `N passed, 0 failed`.
Regenerate icons: `python tools/make_icons.py` (from the project root).

## Layout
```
index.html · manifest.webmanifest · sw.js
css/app.css
js/day.js        day lifecycle + rule engine (pure, tested)
js/store.js      localStorage, backup parse/export
js/photos.js     IndexedDB photos + downscaling
js/reminders.js  time cues
js/app.js        shell: clock sync, router, modals, click delegation
js/views/        today · meals · workouts · progress · settings · more
data/            Hebrew content: meals, workouts, schedule, rules
tests/tests.html in-browser test runner
```
