# FGN League — Availability Board

A tiny shared web app so your eFootball league can mark when they're free to play,
and see at a glance when two players overlap.

## What it does

- Anyone who opens the link can pick their name (or add themselves), pick North or
  South division, and start tapping their free times on a 7-day grid.
- Everyone shares the **same board** — no accounts, no passwords.
- A "Compare" tab lets you pick two players from the *same* division and shows the
  overlapping time slots, color-coded, with a plain list of matching Day/Time slots
  underneath.
- North and South are kept separate in Compare since they don't play cross-division.
- Both divisions' rosters (34 players total, pulled from the league spreadsheet) are
  pre-loaded, so nobody needs to type their name in from scratch.
- Data is stored in **Postgres**, so it survives restarts/redeploys wherever you host it.
- **Timezone-aware.** Each player's timezone is auto-detected when they join (editable
  if it's wrong). Times are saved as universal, and everyone viewing the board — in
  "My Availability" or "Compare" — sees times converted into their own local clock.
  A player in Montreal and a player in London can both use the app normally and the
  overlap shown to each of them is correct for where they are.
- A live clock and clear "you're set to [timezone]" banner sits right above the
  tap grid, so it's always obvious which clock you're looking at.
- Anyone can remove themselves from the league (deletes their name and saved
  availability) via the link at the bottom of the "My Availability" tab.
- The visible grid covers 06:00–00:00 by default (adjustable in `server.js`).
- The app is fully self-contained — no external CDNs are relied on for functionality,
  so it works even with strict ad-blockers or privacy browsers like Brave Shields.

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
Open **http://localhost:3000** — the app will create its tables and seed both
divisions' rosters automatically on first run.

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
