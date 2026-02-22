# Life in the UK Quiz

A browser-based practice app for the UK citizenship test with spaced repetition, review modes, import/export, and cloud persistence.

## Live App

- Primary: `https://life-in-the-uk-quiz.charlesnchr.com`
- Alias: `https://lifeuk.charlesnchr.com`

## Features

- Practice modes: all, failed, weak areas, new only
- Spaced repetition review queue
- Progress stats and difficult-question tracking
- Data export and import (JSON)
- Google sign-in (Supabase Auth)
- Persistent cloud sync (Cloudflare Worker + D1)

## Tech Stack

- Frontend: vanilla HTML/CSS/JS
- Hosting + API: Cloudflare Workers
- Persistence: Cloudflare D1 (SQLite)
- Auth: Supabase (Google OAuth)

## Project Structure

- `index.html` - app UI and script loading
- `app.js` - quiz logic, state, stats, import/export
- `srs.js` - spaced repetition model
- `sync.js` - local storage to backend sync
- `auth.js` - Supabase auth integration
- `worker.js` - `/api/progress` backend (D1)
- `wrangler.toml` - Cloudflare bindings and deploy config

## Local Development

Prerequisites:

- Node.js (for `npx wrangler`)
- Cloudflare account + Wrangler auth

Run locally:

```bash
npx wrangler dev
```

Then open the local URL Wrangler prints.

## Deploy

```bash
npx wrangler deploy
```

## Auth Configuration (Supabase)

In Supabase:

1. Enable Google provider under `Authentication -> Providers -> Google`.
2. Set `Site URL` and allowed redirect URLs under `Authentication -> URL Configuration`.

Recommended redirect URLs:

- `https://life-in-the-uk-quiz.charlesnchr.com`
- `https://lifeuk.charlesnchr.com`
- `https://life-in-the-uk-quiz.charles-n-chr.workers.dev`

## Data Model

The Worker stores one JSON payload per user in D1:

- Table: `progress`
- Columns: `user_id` (PK), `payload`, `updated_at`

If no authenticated user id is provided, the backend falls back to a default single-user key.

## Security Notes

- Do not commit API keys/tokens to git.
- Rotate any token that was ever exposed in logs, commits, or chat.
