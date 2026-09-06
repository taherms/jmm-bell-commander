# JMM Bell Commander

A bell-scheduling web app for a madrasa: multiple timetables, each with its own
bells and ring sounds, installable on a phone or tablet as an app. Runs
entirely in the browser — no server, no database, hosted free on GitHub Pages.

## Read this first: how it actually rings bells

This is a **bell station**, not a per-student notification app.

A website — even installed as an app — cannot wake up a closed phone or a
locked screen to play a sound on a schedule. That's a restriction from Apple
and Google, not this app. So the intended setup is:

> **One device stays open, awake, and plugged in**, connected to your
> speakers (via cable or Bluetooth). That one device rings for the whole
> madrasa. It will not ring on everyone's personal, closed phones.

For that one "station" device:
- Keep **JMM Bell Commander** open and the screen on (the app tries to hold
  the screen awake automatically — see Settings).
- Keep it charging. A dead battery means no bells.
- Once each time you open the app (each day, typically), tap **Enable
  Sound** on the Now tab. Browsers block automatic sound until you've
  tapped something first — this is a one-tap, once-a-session step.
- Use the **Test** button next to any bell to confirm the sound and volume
  are right before relying on it.

## Installing as an app

Once it's hosted (steps below), open the site's URL on the station device:

- **Android (Chrome):** open the site → menu (⋮) → **Add to Home screen** /
  **Install app**.
- **iPhone/iPad (Safari):** open the site → Share button → **Add to Home
  Screen**. (Must be opened in Safari, not Chrome, for this to work on iOS.)

It then opens full-screen like a normal app, with its own icon.

## Logging in

There's a single shared password for everyone — appropriate for a shared
station device, not real per-user accounts (a free static site like this has
no server to keep individual passwords on).

**Default password:** `madrasa786`

To change it, go to **Settings → Shared login password**:
- **"Save on this device only"** — changes the password just in the browser
  you're using right now. Good for testing.
- **"Show hash to update for everyone"** — shows a code to paste into
  `js/auth.js` (replacing `DEFAULT_HASH`), which you then commit and push to
  GitHub so the new password applies on every device.

## Timetables & bells

- Create as many timetables as you like (Regular Weekdays, Fridays, Ramadan,
  Exam Week, etc.).
- Each one applies either to **recurring weekdays** (e.g. every Mon–Thu) or
  to a **specific date range** (e.g. 18 Feb – 20 Mar), so you can schedule
  well ahead of time.
- If two timetables could both apply on the same day, the **date-range one
  wins**, and among ties, whichever is **listed first** in the Timetables
  tab — use the ↑/↓ arrows on each card to reorder priority.
- On the **Now** tab, "Today's timetable" can be manually overridden for a
  single day (e.g. an unplanned holiday) — it resets back to Auto the next
  day on its own.
- Use **Pause Schedule**, **Skip Next Bell**, **Stop Ringing**, **Ring now**,
  and **Test Volume** on the Now tab for station-side control.
- Each bell has its own time, label, and ring sound.

### Holidays and timetable exceptions

- Add station-wide closure dates under **Settings → Holidays and closures**.
  No timetable rings on those dates.
- In a timetable editor, add date exceptions to exclude a normally scheduled
  date or include a special date outside its normal weekday/date-range rule.

## Rings (bell sounds)

Two sources:

1. **Default rings** — files sitting in the `rings/` folder in this repo,
   listed in `rings/manifest.json`. These are available on every device,
   because they're part of the site itself. One default, `bell-classic.wav`,
   is included. **To add more:** drop an audio file into `rings/`, then add
   a matching entry to `rings/manifest.json`:
   ```json
   { "id": "assembly-bell", "name": "Assembly Bell", "file": "assembly-bell.mp3" }
   ```
   Commit and push — GitHub Pages picks it up automatically (no code
   changes needed).

2. **Custom rings** — uploaded from the **Rings** tab, right from the app.
   These are saved only in that device's browser storage, not in the repo,
   so they won't appear on other devices automatically. Use **Export** (see
   below) to carry them over.

## Backing up & moving data (Export / Import)

Everything — timetables and custom ring audio — lives in the browser on
that one device. **Settings → Export all data** downloads a single `.json`
file with everything in it (custom audio included, as embedded data).

- **Import → Merge** adds the file's timetables/rings alongside what's
  already there.
- **Import → Replace all** wipes the current device's data and replaces it
  with the file's contents — use this to set up a new station device from
  an existing backup.

Keep a recent export somewhere safe; it's your only backup.

## Deploying to GitHub Pages

1. Create a new GitHub repository (public repos get free Pages hosting).
2. Upload every file and folder from this project, keeping the folder
   structure exactly as it is (`css/`, `js/`, `rings/`, `icons/` must stay
   as folders, not be flattened).
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to "Deploy from a
   branch", branch `main`, folder `/ (root)`. Save.
5. GitHub gives you a URL like `https://yourusername.github.io/your-repo/`.
   That's the link to open on the station device (and to install as an
   app, per above).

Any time you change a file, commit and push — Pages redeploys automatically
within a minute or two.

## A few honest limitations

- This is a shared **password gate**, not real security — it's a static
  site, so the password check happens in the visitor's own browser.
  Anyone determined enough (opening dev tools) can get past it. It's meant
  to stop casual access, not protect sensitive information.
- Bells only ring while this app is **open on the station device** with the
  screen on — see the top of this file.
- Sound must be **unlocked with one tap per session** (browser policy, not
  a bug) — that's what the "Enable Sound" button is for.
- Custom ring uploads and timetable edits are stored **per device/browser**.
  Use Export/Import to move them around; there's no automatic sync between
  devices.

## Project structure

```
index.html            App shell + login gate
manifest.json          PWA manifest (name, icons, install behaviour)
service-worker.js       Offline caching of the app + rings
css/styles.css          All styling
js/utils.js             Small shared helpers
js/db.js                IndexedDB wrapper for custom ring audio
js/auth.js              Shared password gate
js/scheduler.js          Clock tick loop, active-timetable logic, audio queue
js/app.js                State, rendering, all UI wiring
rings/manifest.json      List of default rings
rings/bell-classic.wav   The one bundled default ring
icons/                   App icons (192, 512, maskable, Apple touch icon, favicon)
```
