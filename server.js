require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Copy .env.example to .env and fill in your Postgres connection string.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most hosted Postgres providers (Neon, Supabase, Render) require SSL.
  // Set PGSSL=disable in .env if you're running a local Postgres without SSL.
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
});

// ---- time grid config ----
// Days shown across the top, hours shown down the side.
// Edit these two arrays if your group plays at different hours.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','00:00'];

const COLORS = [
  '#C6FF3D', '#3DDCFF', '#FF6B6B', '#FFD93D', '#B388FF',
  '#4DFFB8', '#FF9F4D', '#6B9BFF', '#FF4DD8', '#4DFF6B',
  '#FFB84D', '#4DE0FF'
];

// This season is open registration: players add themselves via "Join league"
// in the UI. No pre-filled roster is seeded.

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      division TEXT NOT NULL CHECK (division IN ('North','South')),
      color TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      UNIQUE (name, division)
    );
  `);
  // Safe to run even if the column already exists (won't touch existing data).
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS availability (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      hour TEXT NOT NULL,
      PRIMARY KEY (player_id, day, hour)
    );
  `);

  // No auto-seeding — the table simply stays empty until players join.
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Get full state (players, availability, config)
app.get('/api/state', async (req, res) => {
  try {
    const playersRes = await pool.query('SELECT id, name, division, color, timezone FROM players ORDER BY name');
    const availRes = await pool.query('SELECT player_id, day, hour FROM availability');

    const availability = {};
    for (const p of playersRes.rows) availability[p.id] = {};
    for (const row of availRes.rows) {
      if (!availability[row.player_id]) availability[row.player_id] = {};
      if (!availability[row.player_id][row.day]) availability[row.player_id][row.day] = [];
      availability[row.player_id][row.day].push(row.hour);
    }

    res.json({ players: playersRes.rows, availability, days: DAYS, hours: HOURS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

// Add a new player
app.post('/api/players', async (req, res) => {
  const { name, division, timezone } = req.body;
  if (!name || !name.trim() || !['North', 'South'].includes(division)) {
    return res.status(400).json({ error: 'name and valid division (North/South) required' });
  }
  const cleanName = name.trim();
  const tz = timezone || 'UTC';

  try {
    const existing = await pool.query(
      'SELECT id, name, division, color, timezone FROM players WHERE LOWER(name) = LOWER($1) AND division = $2',
      [cleanName, division]
    );
    if (existing.rows.length > 0) return res.json({ player: existing.rows[0] });

    const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM players');
    const color = COLORS[countRes.rows[0].count % COLORS.length];
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    await pool.query(
      'INSERT INTO players (id, name, division, color, timezone) VALUES ($1,$2,$3,$4,$5)',
      [id, cleanName, division, color, tz]
    );
    res.json({ player: { id, name: cleanName, division, color, timezone: tz } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add player' });
  }
});

// Update a player's timezone (e.g. picking up an existing seeded player for the first time,
// or a player who's travelled and wants to correct their zone)
app.patch('/api/players/:id/timezone', async (req, res) => {
  const { timezone } = req.body;
  if (!timezone || typeof timezone !== 'string') {
    return res.status(400).json({ error: 'timezone required' });
  }
  try {
    await pool.query('UPDATE players SET timezone = $1 WHERE id = $2', [timezone, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update timezone' });
  }
});

app.delete('/api/players/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM players WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

// Toggle a single availability cell for a player
app.post('/api/availability', async (req, res) => {
  const { playerId, day, hour } = req.body;
  if (!DAYS.includes(day) || !HOURS.includes(hour)) {
    return res.status(400).json({ error: 'invalid day/hour' });
  }
  try {
    const existing = await pool.query(
      'SELECT 1 FROM availability WHERE player_id = $1 AND day = $2 AND hour = $3',
      [playerId, day, hour]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM availability WHERE player_id = $1 AND day = $2 AND hour = $3', [playerId, day, hour]);
    } else {
      await pool.query('INSERT INTO availability (player_id, day, hour) VALUES ($1,$2,$3)', [playerId, day, hour]);
    }

    const rowsRes = await pool.query('SELECT day, hour FROM availability WHERE player_id = $1', [playerId]);
    const availability = {};
    for (const row of rowsRes.rows) {
      if (!availability[row.day]) availability[row.day] = [];
      availability[row.day].push(row.hour);
    }
    res.json({ availability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`eFootball league availability app running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
