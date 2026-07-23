# FGN League — Availability Board

A tiny shared web app so your eFootball league can mark when they're free to play,
and see at a glance when two players overlap.

## What it does

- Anyone who opens the link can add themselves (pick a name, division, timezone) and
  start tapping their free times on a 7-day grid. **Open registration** — there's no
  pre-loaded roster; the league starts empty each season and fills up as people join.
- Everyone shares the **same board** — no accounts, no passwords.
- A "Compare" tab lets you pick any two players — same division or across divisions
  (handy for finals) — and shows the overlapping time slots, color-coded, with a
  matching list of Day/Time slots alongside the grid on desktop, or below it on mobile.
- Data is stored in **Postgres**, so it survives restarts/redeploys wherever you host it.
- **Timezone-aware.** Each player's timezone is auto-detected when they join (editable
  if it's wrong). Times are saved as universal, and everyone viewing the board — in
  "My Availability" or "Compare" — sees times converted into their own local clock.
  A player in Montreal and a player in London can both use the app normally and the
  overlap shown to each of them is correct for where they are.
- Live clocks (with "you're set to [timezone]" / "current time in [timezone]" banners)
  sit above both the tap grid and the Compare overlap grid, so it's always obvious
  which clock you're looking at.
- Next to each player's name: **wrong timezone?**, **switch player**, and
  **remove me** — all visible at a glance, no scrolling required.
- The visible grid covers 06:00–00:00 by default (adjustable in `server.js`).
- The app is fully self-contained — no external CDNs are relied on for functionality,
  so it works even with strict ad-blockers or privacy browsers like Brave Shields.
- Desktop layouts widen to use available screen space; the Compare tab's match list
  sits beside the grid on desktop and stacks below it on mobile.

## 1. Testing locally (before deploying anywhere)

You have two ways to try this out on your own machine first:

### Quickest: local Postgres
If you have Postgres installed locally:
```bash
createdb fgn_league
```
Then:
```bash
cd efootball-league
npm install
cp .env.example .env
```
Edit `.env` and make sure `DATABASE_URL` points at your local database, e.g.:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fgn_league
PGSSL=disable
```
Then run:
```bash
node server.js
```
Open **http://localhost:3000** — the app will create its tables automatically on
first run. The player list starts empty; use "Join league" to add yourself.

### Recommended: test against the real (free) database you'll deploy with
This catches any issues before you ever touch a hosting provider, since you're
running the exact same code against the exact same database you'll use in production.

1. Go to **[neon.tech](https://neon.tech)** and sign up (free, no credit card).
2. Create a project — Neon gives you a connection string that looks like:
   `postgres://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`
3. Copy that into your local `.env` as `DATABASE_URL`, and **delete or comment out**
   the `PGSSL=disable` line (Neon needs SSL, which is the default).
4. Run `npm install` then `node server.js` — same as above, just now every tap is
   saved to the real cloud database.

Once this works locally, you're ready to deploy — same code, same database.

## 2. Deploying for real (Render + Neon)

This is the free, no-credit-card-required path:

1. **Put the code on GitHub.** Create a new repo and push this folder to it
   (Render deploys straight from GitHub, and it makes future updates a `git push` away).
2. **Create the database on Neon** (if you haven't already, from the section above)
   and copy its connection string.
3. **Go to [render.com](https://render.com)** → New → Web Service → connect your
   GitHub repo.
4. Configure the service:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
5. Under **Environment**, add:
   - `DATABASE_URL` → paste your Neon connection string
   - (leave `PGSSL` unset, since Neon needs SSL)
6. Click **Create Web Service**. Render will build and start it, and give you a
   public URL like `https://fgn-league.onrender.com` — that's the link you share
   with the league.

**Note on the free tier:** Render's free web services sleep after ~15 minutes of
no traffic. The first person to open the link after a quiet spell will wait
10–20 seconds for it to wake up — after that it's instant for everyone until it
goes quiet again. Totally fine for a friend group checking availability.

**This project's actual live setup**, for reference:
- GitHub repo: `w4ddy/FGN-scheduler`
- Render URL: `https://fgn-scheduler.onrender.com`

**A gotcha we hit, in case it recurs:** GitHub can flag an account and block it
from authorizing third-party apps (like Render) or even from serving its repos to
logged-out visitors — even on a repo marked Public. If Render says "Repository not
found" for a repo you can clearly see in your browser, try opening the repo's URL
in an incognito window while logged out entirely. A 404 there (not just a login
prompt) confirms it's an account-level GitHub restriction, not a Render or
visibility-setting problem. The fix that worked here was pushing the same code to
a second, freshly-created GitHub account and deploying from that instead. If this
happens on your main account, it's worth also filing a ticket at
[support.github.com/contact](https://support.github.com/contact) so it doesn't keep
causing friction — flagged accounts don't reliably unflag themselves.

## 3. Making changes (editing workflow)

Once deployed, updating the live site is just: edit locally → commit → push. Render
watches the connected GitHub branch and redeploys automatically on every push — no
manual redeploy step needed for normal changes.

```bash
# after editing server.js and/or public/index.html locally:
git add .
git commit -m "short description of what changed"
git push w4ddy main
```

(`w4ddy` here is the name of the git remote pointing at the GitHub repo Render is
watching — check yours with `git remote -v` if you're not sure what to use instead.)

Within a few seconds of the push, a new deploy will kick off automatically —
watch it happen live under **Render → your service → Deploys**, or the **Logs** tab
for the build/start output. A typical deploy (this app) takes well under a minute.

**Things that do NOT trigger a redeploy on their own:**
- Editing `.env` locally — that file never leaves your machine (it's gitignored on
  purpose). If you need to change an environment variable in production (like
  `DATABASE_URL`), you have to update it separately in **Render → Environment**, not
  in your local `.env`.
- Changes to files not committed/pushed — `git status` before pushing if you're ever
  unsure what's staged.

## 4. Redeploying / troubleshooting a failed deploy

**To manually trigger a redeploy** (e.g. after fixing an environment variable, or
just to restart the app without any code change):
1. Go to your service on [dashboard.render.com](https://dashboard.render.com)
2. Click **Manual Deploy** (top right of the service page) → **Deploy latest commit**

**If a deploy fails, read the Logs tab first** — it's the fastest way to diagnose:
- Go to your service → **Logs** (left sidebar)
- Scroll to the failed deploy's output. Common failure points and what they usually mean:
  - Fails during `npm install` → almost always a `package.json`/`package-lock.json`
    problem, or a dependency that needs a newer Node version. Check the error message
    for the specific package it choked on.
  - Fails right after "Deploying..." or the app immediately crashes → usually a
    missing or wrong `DATABASE_URL`. Go to **Environment** (left sidebar) and confirm
    the variable is set and the connection string is correct (copy it fresh from Neon
    if in doubt — a rotated password is a common cause here).
  - App builds and starts, but the live URL shows an error page or blank screen →
    check the browser's DevTools Console for JavaScript errors; this usually points
    to a bug in `public/index.html` rather than the server itself.

**If the database connection itself seems broken** (not just the env var):
1. Log into [neon.tech](https://neon.tech) and confirm the project/database is still
   active — free-tier Neon projects can be auto-suspended after a long period of
   total inactivity, but they wake up again on the next connection attempt, so this
   is rarely the actual cause of a hard failure.
2. Try running the same `DATABASE_URL` locally (`node server.js` with your `.env`
   pointed at it) — if it fails the same way locally, the problem is the database/
   connection string, not Render.

**If you ever need to roll back** to a previous working version:
1. Go to your service → **Deploys**
2. Find an earlier deploy that was working (marked with a past "Live" status)
3. Click the **⋯** menu next to it → **Redeploy** (or "Rollback to this deploy,"
   depending on Render's current UI wording)

This redeploys that exact old commit without needing to touch git at all — useful
for getting back online quickly while you debug the actual issue locally.

## Adjusting the days/hours shown

Open `server.js` and edit these two lines near the top:

```js
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['12:00','13:00', ... '00:00'];
```

Add/remove hours to match when your group actually plays. The grid on the frontend
adjusts automatically to whatever list you put here. If you change this after
people have already saved availability, old saved slots outside the new range just
won't show (they're not deleted, so reverting the range brings them back).

## A note on timezones

- The visible hour range (`12:00`–`00:00` by default) applies to whichever timezone
  is currently viewing the grid. If a player's local schedule falls outside that
  window once converted (e.g. someone many hours away taps a slot that lands very
  early morning for someone else), it's still saved correctly, but you may need to
  widen the `HOURS` array in `server.js` so it's visible to everyone.
- If a player travels, or their detected timezone was wrong, they can click
  "wrong timezone?" next to their name in "My Availability" to correct it — this
  doesn't move or lose any of their saved times, since it's just a lens for
  displaying/entering them.

## Notes

- Player colors are assigned automatically in join order (12-color rotating
  palette).
- There's no login system by design — quick and frictionless for a small trusted
  group. If you want to lock it down later, the natural next step is a simple
  per-player edit PIN.
- The timezone conversion library (Luxon) is bundled directly in `public/luxon.min.js`
  rather than loaded from an external CDN, so the app works fully even for players
  running Brave Shields, ad-blockers, or other privacy tools that might otherwise
  block third-party scripts. The Google Fonts link is still external — if that's ever
  blocked for someone, the page just falls back to a default system font, nothing
  breaks.
- `.env` is in `.gitignore` on purpose — never commit real database credentials to
  GitHub. Only `.env.example` (with placeholder values) should be in the repo.
