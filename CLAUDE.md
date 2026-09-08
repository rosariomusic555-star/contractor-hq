# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev          # Vite dev server on http://localhost:8080
npm run build        # production build to dist/
npm run build:dev    # build with development mode (keeps lovable-tagger)
npm run lint         # ESLint over the repo
npm run test         # vitest run (single pass)
npm run test:watch   # vitest in watch mode
```

Run a single test file or case:

```sh
npx vitest run src/lib/demoData.test.ts
npx vitest run -t "sum to the real amount"
```

Both `bun.lockb` and `package-lock.json` are checked in, but the scripts and README assume **npm**.

`npm run lint` has a standing baseline of **11 problems (3 errors, 8 warnings)** — all pre-existing in
`tailwind.config.ts` (`require()`), `src/components/ui/{command,textarea}.tsx` (empty interface), and
react-refresh fast-refresh warnings on generated `ui/` files + `lib/auth.tsx`. A change should not
add to that count.

## Architecture

Vite + React 18 + TypeScript + shadcn/ui + Tailwind, with **Supabase** (Postgres + RLS) as the
backend and **`@tanstack/react-query` v5** for all data fetching. The app was scaffolded by Lovable
(`lovable-tagger` still runs in dev/`build:dev`) but has since grown a real backend, real
route-driven navigation, and a full design system.

### Backend / data

- **`src/lib/supabase.ts`** — the client, from `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
  (`.env`, not committed; see `.env.example`). Throws if either is missing.
- **`supabase/migrations/0001`–`0012`** — schema, RLS (`user_id = auth.uid()` on the owner tables,
  join-based on the child tables), and four `SECURITY DEFINER` RPCs (`get_shared_quote`,
  `get_shared_invoice`, `set_quote_item_selection`, `sign_quote`) that power the token-gated
  client-facing pages. Migrations are applied by hand in the Supabase dashboard.
- **`src/lib/api.ts`** — every type (`Client`, `Project`, `Quote` → `QuoteSection` → `QuoteItem`,
  `Invoice`, `MaterialsSection` → `MaterialsItem`, `Expense`), every CRUD function, and the derived
  helpers `quoteTotal`, `pickHeadlineQuote`, `materialsCogs`. Quotes/invoices have a nullable
  `project_id` (they can stand alone). **Do not add UI-only fake data here.**
- **`src/lib/metrics.ts`** (`monthlyRevenue`, `momChange`), **`src/lib/aging.ts`** (`invoiceDaysLate`,
  `agingBuckets`, `overdueCount`), **`src/lib/statusMeta.ts`** (the single source for quote / invoice /
  project status → label + pill class + left-border colour; `src/lib/projectStatus.ts` is a
  back-compat re-export).

### `src/lib/demoData.ts` — presentation-only

Realistic **fake** data for features the schema doesn't have yet (crew scheduling, job-stage
pipeline, per-job progress, work-type splits, quote markup/tax, org quote defaults, automations,
invoice history). Rules, enforced by `src/lib/demoData.test.ts`:

- never imported by `src/lib/api.ts`; never passed to `supabase.*`
- helpers are pure and deterministic, seeded off real row ids, so decorating a real project/quote
  looks stable
- real entities and derivable metrics (contract totals, margins, aging, lifetime value, MoM) always
  use live data — demoData only decorates

### Navigation & shell

- **`src/App.tsx`** — provider tree (`QueryClientProvider` → `AuthProvider` → `TooltipProvider` →
  `Toaster`/`Sonner` → `BrowserRouter`). Public routes `/quote/:token` and `/invoice/:token` render
  outside any layout with no auth gate. Everything else is under `<Route element={<AppLayout />}>`:
  `/dashboard`, `/projects` + `/projects/:id` (+ nested `/materials`, `/quotes`, `/quotes/:quoteId`,
  `/invoices`, `/invoices/:invoiceId`, `/expenses`), `/quotes` + `/quotes/:quoteId`, `/invoices` +
  `/invoices/new` + `/invoices/:invoiceId`, `/revenue`, `/clients`, `/settings`. `*` → `NotFound`.
- **`src/lib/auth.tsx`** — `AuthProvider` + `useAuth()` (`session`, `loading`, `signIn/Up/Out`).
  `AppLayout` gates: `loading` → spinner, no `session` → `<AuthScreen />`, else the shell.
- **`AppLayout`** renders `<Sidebar />` (desktop, `hidden md:flex`, fixed `w-64`) + `<BottomTabBar />`
  (mobile, `md:hidden`, fixed bottom — Home / Projects / center **FAB** / Money / More, with a
  "create" action sheet and a "more" sheet) + `<main className="p-4 pb-24 md:ml-64 md:p-8">` wrapping
  a `max-w-[1200px]` inner div. Nav items come from the single `src/components/layout/navItems.ts`.
- `QuoteWorkspace` (`/quotes/:quoteId` **and** `/projects/:id/quotes/:quoteId`) and
  `InvoiceWorkspace` are the single edit surfaces for a quote / invoice — the wrappers only differ
  in where "back" points.

### Views

Real live data via react-query in every view (`src/components/views/*`, dashboard cards in
`src/components/dashboard/*`). Each screen is responsive: a desktop layout plus, below `md`, a
`MobilePageHeader` (the slate `#687B85` block) + stacked cards / `ListCard` rows. List screens
(Projects, Quotes, Invoices, Clients) share the pattern: `PageHeader` / `MobilePageHeader` +
`FilterSegment` (desktop) / `FilterPills` (mobile) + a `KpiCard` row + a `data-table` (desktop) or
`ListCard` list (mobile). `SettingsView` is intentionally non-persisting config UI.

### Design system

- **`src/index.css`** — semantic HSL CSS variables tuned to the "ContractorPro" palette (ink
  `#1D242E`, border `#E2E7EC` / hairline `#EDF1F4`, app bg near-white, primary green `#82C48E` with
  ink-on-green `--primary-foreground`, sidebar slate `#687B85`, scheduled-blue `--info`). `--radius`
  is the control radius; `--radius-card` (`1rem`) is the card radius. `.dark` block exists, no theme
  toggle wired. `@layer components`: `.stat-card` / `.card-surface`, `.nav-item` (+`.active`),
  `.data-table`, `.badge-status` + `badge-paid|pending|draft|info|scheduled|overdue|declined|paid-solid`,
  `.mobile-header`, `.kpi-card`, `.filter-segment`.
- **`tailwind.config.ts`** — every token wired as `hsl(var(--x))`; `borderRadius.card`; `boxShadow`
  tokens; keyframes/animations (`fade-in`, `slide-in`, `scale-in`, accordion). Plugin:
  `tailwindcss-animate`.
- **`src/components/common/*`** — the shared building blocks: `PageHeader`, `MobilePageHeader`,
  `FilterControls` (`FilterSegment` / `FilterPills`), `KpiCard`, `StatusPill`, `MoneyRow`,
  `SearchInput`, `ListCard`. Reach for these before inventing new markup.

### Conventions

- Import via the `@/` alias (→ `src/`); merge classNames with `cn()` from `src/lib/utils.ts`; format
  money with `formatCurrency()` and counts with `pluralize()` from the same file.
- shadcn/ui primitives in `src/components/ui/` are generated (`components.json`) — regenerate rather
  than hand-editing.
- TypeScript is deliberately loose (`strict: false`, `noImplicitAny: false`); ESLint has
  `@typescript-eslint/no-unused-vars` off.
- Status rendering: use `statusMeta.ts` + `<StatusPill>` — do not hand-roll `badge-status` maps.
- Test setup (`src/test/setup.ts`) stubs `window.matchMedia`; environment is jsdom, globals enabled.
