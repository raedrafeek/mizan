# Mizan — Project Context & Handoff

> Read this first. It contains everything needed to resume work on this project
> exactly where we left off. Last updated: 2026-07-13.

## What this project is

**Mizan** (Arabic: "balance/scale") is a personal finance manager PWA, built by
and for the user (Raed, based in Kuwait — no bank integrations exist there, so
everything is manual entry). It is the finance core of a future modular
**"Life OS"** — tasks/health/AI modules will bolt onto the same shell later.

The app lives in [mizan/](mizan/). The original design mockup (the north star
for UI style and layout) is [Reference/Decision Dashboard.dc.html](Reference/Decision%20Dashboard.dc.html).
The original approved plan: `C:\Users\RaedRafeek\.claude\plans\hi-i-was-crispy-map.md`.

### Product concepts (the three differentiators)
1. **Multi-currency first-class** — system default currency **KWD**; accounts and
   transactions in any currency (USD, INR, BTC…). Transactions **freeze the FX
   rate at entry** (`fxRateToDefault`, `amountDefaultMinor`) so history never
   drifts; live balances/net worth convert at the latest cached rate.
2. **"Everything is an account" net worth** — banks, cash, credit cards
   (`isLiability`), crypto/stocks (`kind: priced` = quantity × live price).
   Every account has `includeInNetWorth` toggle (default ON).
3. **Quick-log as hero interaction** — − / + / ⇄ toggle → amount → category
   chip → COMMIT. A category and account are ALWAYS pre-selected (user
   requirement: no "Uncategorized" logs, ever).

## Stack & architecture

- **Next.js 15 (App Router) + React 19 + TypeScript**, Tailwind CSS v4
  (theme tokens in `src/app/globals.css` — dark only, mockup palette),
  TanStack Query v5, `decimal.js` at FX boundaries only.
- **Prisma + Supabase Postgres** (project ref `xtxbjldamfqbjmsyyiyb`,
  eu-central-1). **Vercel** hosting, functions pinned to `fra1`, repo
  `github.com/raedrafeek/mizan`, auto-deploys on push to `main`.
- **Money = integer minor units** (KWD exp 3, USD exp 2) stored as BigInt;
  `src/lib/money.ts` is the only arithmetic site (18 vitest tests).
  `jsonSafe()` in `src/lib/serialize.ts` converts BigInt→number at API edges.
  **Exception:** `adjustment` transactions carry a SIGNED `amountMinor`
  (all other types are positive with sign derived from type).
- **Life OS shell**: `src/shell/` is module-agnostic (Nav, Card, CardGrid,
  AlertTray, toast, Skeleton, privacy). Modules register via
  `src/shell/module-registry.ts` + one import line in `src/modules/index.ts`.
  Finance is the only module so far (`src/modules/finance/`).
- **Server services** in `src/modules/finance/server/`:
  - `fx.ts` — **`loadFxContext()`** batches settings+currencies+latest rates in
    ONE parallel round-trip. ALWAYS use/pass this context; per-lookup FX queries
    were an N+1 disaster (9–18s endpoints) fixed in the perf batch.
  - `balances.ts` — `computeBalances(ctx)` (parallel batched, DISTINCT ON latest
    price quotes), `netPositionFromBalances()` pure helper.
  - `alerts.ts` — evaluator (budget_pace, horizon_due, stale_price), deduped by
    `dedupeKey`, **throttled to 10 min** via settings key `alerts.lastEval`,
    invoked lazily from GET `/api/alerts`.
  - `prices.ts` — CoinGecko crypto (lazy, 15-min freshness, called from
    networth route), Finnhub stocks (needs `FINNHUB_API_KEY`, manual refresh
    button only — no cron; Vercel Hobby allows max 2 daily crons).
  - `reports.ts` — cash flow + category spend vs budgets per month.
- **Crons** (`vercel.json`): `/api/cron/fx` daily 06:00 UTC,
  `/api/cron/snapshot` 20:55 UTC (=23:55 Kuwait; hybrid net-worth history:
  daily snapshot rows + live "today" point for the sparkline).
  Guarded by `Authorization: Bearer CRON_SECRET`.
- **Auth**: `src/middleware.ts` locks ALL pages/APIs (except `/login`,
  `/api/auth/*`, `/api/cron/*`) when `APP_PASSWORD` env is set. HMAC-signed
  90-day session cookie (`src/lib/auth.ts`, Web Crypto — edge-safe). Local
  `.env` has `APP_PASSWORD=""` → localhost is open; **the lock is active on
  Vercel** (user set the env vars). Padlock icon in Nav = logout.
- **PWA**: `src/app/manifest.ts`, generated icons (`scripts/make-icons.mjs`,
  dark diamond mark), hand-written `public/sw.js` (network-first, cache
  fallback, prod-only registration), `/log` = phone-first quick-log route +
  manifest shortcut. Privacy mode (eye icon) masks balances via
  `src/shell/privacy.tsx`.
- Kuwait timezone (UTC+3) is hardcoded in several server files — fine for the
  single user; needs a setting before public release.

## Status: what is DONE (all pushed to main, deployed)

| Commit | What |
|---|---|
| 9538924 | M1: accounts CRUD, multi-currency quick-log, transaction edit/delete/transfers API, FX + snapshot crons |
| 2da995c | M2: net position hero + sparkline, cash flow card, budgets + pace, top categories, live crypto/stock prices |
| e466d92 | M3: campaigns (savings goals w/ pace chips), financial horizon (log-now + monthly/yearly roll-forward), alerts engine + bell tray |
| 87631d3 | M4: PWA (manifest/icons/SW), /log screen, privacy mode, `npm run backup` (JSON dump), "/" focuses amount |
| 4f37753 | Crons limited to Vercel Hobby (2 daily) |
| 18d3ae3 | **Perf batch**: FxContext (N+1 fix, 6–15× faster), throttled alerts, fra1 pin, pool 1→5 |
| df68335 | **Lock screen** (middleware + login page + logout) |
| d56f6da | **Money movement**: ⇄ transfer mode in quick-log, date backdating chip (Today/Yesterday/picker), reconcile → signed adjustment (`POST /api/finance/accounts/[id]/reconcile`) |
| ba57263 | **UX batch**: default + usage-ordered categories (localStorage `mizan.lastCat.*`, `mizan.catUsage`), optimistic commit w/ toast rollback, month nav ‹ ›, FX ticker from account currencies, skeletons, day-grouped transactions, iOS safe-area |
| 2824b0c | **Trust+Phone** (from 5-persona review): CoinGecko symbol search + picker (user's real HBAR was mis-symboled → valued 0, fixed in DB), NO PRICE badges (`balance.priceStatus`), transfers carry own per-leg value + optional `counterAmount` (fee = gap), future-date 400, stale-alert dedupe per condition, touch-visible row actions (`.touch-show`), sticky quick-log date |
| c2e9cfe | **Scale+Privacy**: transactions filter bar (account/category/month/note search) + drill-down from Top Categories, `/finance/categories` management page (add/rename/archive), privacy mode covers all amounts |
| c2bc241 | **Demo dataset**: `scripts/demo-seed.ts` (8 realistic accounts, 730 txns over 1yr, budgets/campaigns/horizon, 363 snapshots; IDs tracked in Setting `demo.seed`) + `scripts/demo-clean.ts` (exact removal). Fix: crypto quote freshness now per-coin (new coin no longer starved by another coin's fresh quote) |
| 81be2c6 | **Campaign contributions**: ADD (signed increment, "-50" removes, clamped ≥0) + EDIT (name/target/date/saved-so-far) on campaign rows — manual campaigns previously had no way to update progress |
| 1e0ac4d | **Mobile quick-log fix**: flex-wrap into 3 rows on phones (controls / category rail / full-width COMMIT) — rail was collapsing to 0 width, COMMIT protruded |
| 10a7f9b | **Edit/restore completeness audit**: horizon EDIT (+ recurrence clearable to one-off), account EDIT (name/mask/symbol/manual price), unarchive UI for categories+accounts (`?archived=1` + RESTORE), campaign tracking-mode switch (manual ↔ linked) |
| f133bb0 | **Path B phase 1 — mobile-first shell**: bottom tab bar + center log FAB on phones, left rail on desktop; 4 destinations Home `/`, `/activity`, `/plan`, `/accounts` (+`/categories`; old `/finance/*` redirect); registry `navItems`→`destinations`; modules now register in the CLIENT bundle too (per-bundle registry was a latent bug); vocabulary: Campaigns→Goals, Horizon→Upcoming, Net position→Net worth, reconcile→fix balance |
| bd25a53 | **Path B phase 2 — numpad log** (`/log`, FAB target): amount-first numpad, SPENT/RECEIVED/MOVED modes, usage-ordered category grid (always one selected), account picker sheet, sticky backdate chip, received-amount field on cross-currency MOVED, **UNDO on the success toast** (toast API gained actions), keyboard support; create/delete now invalidates cashflow+networth |
| 1fc4b59 | **Path B phase 3 — verdict Home**: SafeToSpendHero (budgets−spent, per-day for days left, pace tick, red-but-counting when over, tap→calculation breakdown sheet, honest no-budget fallback), InsightCard (max ONE priority-ranked dismissible alert), UpNextCard (nearest horizon items + one-tap LOG IT); QuickLog inline bar is desktop-only; net worth hero lives on `/accounts` |

Everything from the full project review (2026-07-13) is complete. The user is
actively logging real data (real accounts + transactions exist in the DB —
**never pollute them; test data must be prefixed and cleaned up**).

## Verification tooling

- `npm run check` (tsc + eslint), `npm test` (18 money tests).
- **`npx tsx scripts/stress-test.ts`** — inserts 800 marked (`__RVW__`) mixed-currency
  transactions + accounts/budgets/campaigns/horizon, times every endpoint,
  runs functional spot checks, then deletes everything it created. Use after
  any significant change. Current baseline (local, Kuwait→Frankfurt ~600ms/RT):
  accounts ~1.3s, networth ~1.8s, currencies ~0.6s, alerts ~1.2s. Deployed
  (fra1, colocated) is much faster.
- `npm run backup` — full JSON dump to `backups/` (gitignored).

## Environment quirks (per-machine — IMPORTANT)

> The notes below describe the ORIGINAL work machine (office). **On a new
> machine** (e.g. the user's home computer): first check `node --version` and
> `git --version`; if missing, install them (portable installs to
> `%LOCALAPPDATA%` worked well before, no admin needed), run `npm install` in
> `mizan/`, and verify `.env` exists (it syncs via OneDrive with the project;
> if cloning from GitHub instead, recreate it from `.env.example` — Supabase
> URLs, CRON_SECRET; leave APP_PASSWORD empty locally). Claude's persistent
> memory does NOT transfer between machines — this file is the source of truth.

- **Portable Node 22.14.0 at `%LOCALAPPDATA%\nodejs`**, portable MinGit at
  `%LOCALAPPDATA%\git\cmd` — both on user PATH, but **fresh shells in a new
  session may need**: `$env:PATH = "$env:LOCALAPPDATA\nodejs;$env:LOCALAPPDATA\git\cmd;$env:PATH"`
- PowerShell 5.1. Execution policy set to RemoteSigned (npm works). **Passing
  JSON to curl.exe inline gets mangled** — write body to a temp file and use
  `-d "@file.json"`.
- Workspace is inside OneDrive (fine, just slow npm installs).
- `next build` fails with EPERM on the Prisma DLL if the dev server is
  running — stop node processes first.
- `.env` changes to middleware-read vars (APP_PASSWORD) and pool settings need
  a FULL dev-server restart (globalThis-cached Prisma client + cached env).
- Scripts importing `@prisma/client` must run from inside `mizan/`.
- `DATABASE_URL` must keep `?pgbouncer=true&connection_limit=5` (Supabase
  transaction pooler; limit=1 serializes parallel queries — don't regress).
- git user configured as Raed Rafeek / vazinex@gmail.com; GitHub credentials
  cached via git-credential-manager.

## How to run

```powershell
cd mizan
npm run dev        # http://localhost:3000 (no lock locally)
npm run check ; npm test
```

Deploy = `git push` (Vercel auto-builds; lock screen + crons active there).

## Backlog / next steps (user decides when)

0. **Path B remaining phases** (mobile-first consumer redesign; concept artifact
   at https://claude.ai/code/artifact/15ca7a2a-3210-493e-8c4d-6d5317ab5850,
   full design rationale in the 2026-07-15 session):
   **Phase 4 — detail sheets**: tap a transaction row → bottom-sheet edit
   (replace inline forms on mobile); tap an account → account screen (its
   activity + fix balance/edit/archive); budget setup wizard proposing
   amounts from observed spending; goal −/+ toggle in quick-add.
   **Phase 5 — onboarding + settings**: first-run flow (currency → account
   templates → first log), empty states for all tabs, settings screen
   (home currency, app lock, notifications, export). Later: offline outbox
   (IndexedDB + sync), Web Push (bill due + smart evening log prompt),
   recurring-transaction detection → suggest Upcoming items.
   **Life OS decision made**: Home is the cross-module screen; modules
   contribute destinations (tab sets come when a 2nd module exists).
1. **Tasks module** — first real test of the Life OS shell contract
   (new folder in `src/modules/`, register nav + dashboard cards + alert kinds;
   zero shell edits expected). Mockup shows the intended Tasks card.
2. **AI ask-bar** ("Ask anything about your money…" in the mockup) — natural
   language over the user's data, likely Claude API + tool use over the
   finance services.
3. Smaller ideas parked: unarchive UI for archived accounts, Finnhub cron when
   off Hobby plan, settings-driven timezone/default currency, service-layer
   unit tests, category management UI (add/rename/reorder), campaigns linked
   to horizon, CSV export/import.
4. Long-term: productization (multi-user via Supabase Auth — the lock screen is
   single-user by design).

## Working style notes

- User prefers: build → verify end-to-end with real API calls → commit+push per
  batch, with before/after evidence when performance is involved.
- Always verify with `stress-test.ts` + `npm run check` + `npm test` before
  pushing; production build check (`npm run build`) before risky pushes.
- Persistent memory also exists at
  `C:\Users\RaedRafeek\.claude\projects\...\memory\mizan-project.md` (same
  facts, condensed).
