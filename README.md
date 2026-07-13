# Mizan — personal finance, balanced

A multi-currency, "everything is an account" personal finance manager — the finance
core of a modular Life OS. Built with Next.js 15, React 19, Prisma, and Supabase
Postgres. Dark UI based on the Decision Dashboard mockup in `../Reference/`.

## Core concepts

- **Default currency (KWD)** with accounts/transactions in any currency. Transactions
  freeze the FX rate at entry so history never drifts; balances and net worth convert
  at the latest cached rate.
- **Everything is an account**: banks, cash, credit cards (liabilities), crypto and
  stocks (priced holdings = quantity × live price). Each account has a
  "count in net worth" toggle.
- **Quick-log** is the hero interaction: − / + toggle → amount → category chip →
  COMMIT. Amount is in the spend-from account's currency with a passive converted
  preview.

## One-time setup

1. **Supabase**: create a free project at [supabase.com](https://supabase.com).
   In *Project Settings → Database → Connection string*, copy the pooler URLs.
2. Copy `.env.example` to `.env` and fill `DATABASE_URL` (transaction pooler,
   port 6543) and `DIRECT_URL` (session pooler, port 5432), plus a random
   `CRON_SECRET`.
3. Install & initialize:

   ```powershell
   npm install
   npm run db:push     # create tables in Supabase
   npm run db:seed     # currencies + default categories + settings
   npm run dev         # http://localhost:3000
   ```

4. Prime FX rates once (or wait for the daily cron in production):

   ```powershell
   curl.exe -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/fx
   ```

## Deploying to Vercel

1. Push this folder to a GitHub repo, import it in Vercel.
2. Set env vars in Vercel: `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET`
   (and later `FINNHUB_API_KEY`).
3. `vercel.json` already schedules the daily FX refresh (06:00 UTC) and the
   nightly net-worth snapshot (20:55 UTC = 23:55 Kuwait).
4. On your phone, open the deployed URL and "Add to Home Screen" — full PWA
   packaging lands in M4.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run check` | typecheck + lint |
| `npm test` | vitest (money math + services) |
| `npm run db:push` | sync Prisma schema to the database |
| `npm run db:seed` | seed currencies/categories/settings |
| `npm run backup` | dump all data to `backups/mizan-backup-<ts>.json` |

## Backups

Run `npm run backup` periodically (weekly is plenty) — it writes a complete JSON
dump of every table to `backups/`. Keep a copy outside this machine (it's
already inside OneDrive, which counts). Supabase also keeps its own daily
backups on paid plans; the JSON dump is the belt-and-braces copy you own.

## PWA / phone

The app is installable: open the deployed URL → browser menu → Add to Home
Screen. The installed app opens standalone with the Mizan icon; `/log` is the
long-press shortcut for one-handed quick logging. A service worker serves the
last-known data when offline (logging still requires a connection). Press `/`
anywhere on desktop to jump to the amount field, and use the eye icon in the
nav to mask all balances (privacy mode).

## Architecture notes

- `src/shell/` is the module-agnostic Life OS shell (nav, cards, module registry).
  Modules register via `src/modules/index.ts`; the finance module is the first.
- API route handlers live under `src/app/api/finance/*`; server-side services
  (balances, FX, net worth) under `src/modules/finance/server/`.
- Money is stored as integer minor units (KWD exp 3, USD exp 2); `src/lib/money.ts`
  is the only place arithmetic happens. Floats never touch amounts.

## Roadmap

- **M1 (this)**: accounts, multi-currency quick-log, transaction editing, FX cache.
- **M2**: dashboard (net position hero + sparkline, cash flow, budgets + pace,
  top categories), crypto/stock live prices.
- **M3**: campaigns (savings goals), financial horizon (scheduled items), alerts.
- **M4**: full PWA (offline shell, `/log` shortcut), privacy mode, backups.
- **Later**: tasks / health / AI ask-bar modules on the same shell.
