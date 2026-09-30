# ContractorHQ

Job management for outdoor and hardscape contractors. It covers a job from the first lead to the
last maintenance reminder: CRM pipeline, quotes, change orders, invoices and payments, materials
and cost plans, crew scheduling and timesheets, and a client-facing portal.

**Stack:** Vite + React 18 + TypeScript, shadcn/ui + Tailwind, TanStack Query v5, and Supabase
(Postgres + RLS, Auth, Storage, Edge Functions). Deployed on Vercel.

---

## Getting started

Requirements: Node 18+ and npm, plus a Supabase project.

```sh
git clone <repo-url>
cd contractor-hq
npm install
cp .env.example .env     # then fill in the values below
npm run dev              # http://localhost:8080
```

### Environment variables (`.env`)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (Project Settings → API) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `VITE_PUBLIC_SITE_URL` | Public URL of the deployment. Client Hub sign-in links land on `<url>/portal/auth/confirm`. Leave it unset locally. |

The app throws on startup if either Supabase variable is missing.

### Database

The schema lives in `supabase/migrations/` (numbered `0001_…` onward). **Migrations are applied by
hand** in the Supabase dashboard's SQL editor, in order. After you pull, check for new migration
files and run them before you use the features that depend on them.

`supabase/seed.sql` holds optional demo data. Sign up in the app first, then paste your user id
from Authentication → Users into the file and run it.

### Edge Functions

Five functions live in `supabase/functions/`. Deploy them with the Supabase CLI
(`supabase functions deploy <name>`) and set their secrets with `supabase secrets set`:

| Function | What it does | Secrets beyond the Supabase defaults |
| --- | --- | --- |
| `assistant-chat` | In-app AI assistant and AI quote descriptions | `ANTHROPIC_API_KEY` |
| `create-employee` | Owner creates crew / employee logins | — (uses the service role key) |
| `portal-request-link` | Client Hub magic-link sign-in | — (uses the service role key) |
| `send-supplier-email` | Emails material orders to suppliers | `RESEND_API_KEY`, `ORDER_EMAIL_FROM` |
| `weather-forecast` | NWS forecast for schedule risk flags and dashboard weather | `NWS_CONTACT` |

Each function's JWT setting is in `supabase/config.toml`.

---

## Scripts

```sh
npm run dev          # Vite dev server on :8080
npm run build        # production build to dist/
npm run build:dev    # development-mode build
npm run preview      # serve the built dist/
npm run lint         # ESLint
npm run test         # Vitest, single run
npm run test:watch   # Vitest, watch mode
```

Run one test file or test case:

```sh
npx vitest run src/lib/jobCosts.test.ts
npx vitest run -t "sum to the real amount"
```

To type-check, run `npx tsc --noEmit -p tsconfig.app.json`. The root `tsconfig.json` is
solution-style, so a bare `tsc --noEmit` checks nothing.

---

## What's in the app

**Owner app** (signed in):

- **Dashboard / Needs You**: what needs attention today, ongoing jobs, appointments, deliveries, weather
- **Pipeline**: CRM opportunities, site visits, measurements, and lead sources. A job becomes a project when it's Won.
- **Projects**: the project hub, with quotes, change orders, invoices, payments, expenses, cost plan,
  materials sheets and orders, labor plan, photos, progress updates, pre-construction checklist,
  and a crew work order
- **Quotes / Invoices**: full builders plus Quick Quote, Smart Sections, Price Book, and client selections
- **Materials / Expenses / Revenue / Business health**: job costs, the materials center, the revenue
  report, and planned-vs-actual insights
- **Bookings, Appointments, Tasks, Timesheets, Communications**
- **Settings**: business profile, quote defaults, categories, suppliers, overhead, team and employees,
  messages, reviews, maintenance, payroll, and more

**Public, token-gated pages** (no login): `/quote/:token`, `/change-order/:token`,
`/invoice/:token`, `/receipt/:token`, and `/r/:token` (review requests). They're served through
`SECURITY DEFINER` RPCs, never through direct table access.

**Client Hub** (`/portal`): clients sign in with a magic link to see their project, approve
quotes and selections, view schedule updates and progress, send messages, and upload files.

**Employee mode** (`/employee`): restricted crew logins. Crew members see only their assigned
projects, work orders, photos and notes, and their own time.

---

## Project layout

```
src/
  App.tsx                 routes + provider tree
  lib/                    API layer, business math, helpers (most with *.test.ts beside them)
    api.ts                types + CRUD for the core entities
    supabase.ts           Supabase client
    auth.tsx              AuthProvider / useAuth
    statusMeta.ts         status → label / pill / colour (the single source)
    demoData.ts           presentation-only fake data, never persisted
  components/
    views/                one component per screen
    common/               shared building blocks (PageHeader, KpiCard, StatusPill, ListCard…)
    layout/               AppLayout, Sidebar, BottomTabBar, navItems
    ui/                   generated shadcn/ui primitives (regenerate, don't hand-edit)
  index.css               design tokens + component classes
supabase/
  migrations/             schema + RLS, applied by hand
  functions/              Edge Functions (Deno)
docs/                     feature audit and other notes
```

Business math has one source file per domain. Examples: `jobCosts.ts`, `projectMoney.ts`,
`revenueReport.ts`, `materialTracking.ts`, `costPlan.ts`, `plannedActual.ts`, and `precon.ts`.
Views call these files and don't recompute the numbers themselves.

## Conventions

- Import with the `@/` alias (→ `src/`). Merge class names with `cn()`, and format values with
  `formatCurrency()` / `pluralize()` from `src/lib/utils.ts`.
- Render statuses with `statusMeta.ts` + `<StatusPill>`.
- Line-item and section editors keep a local draft and save when the user clicks **Save**.
  They don't save on blur.
- Every owner table has row-level security (`user_id = auth.uid()`). New Storage buckets and
  prefixes need their own Storage RLS policies.
- `npm run lint` has a known baseline of pre-existing problems. A change shouldn't add to it.

See `CLAUDE.md` for more detailed architecture notes.

## Deployment

Vercel builds with `npm run build` and serves `dist/`. `vercel.json` rewrites every path to
`index.html` for client-side routing. Set the three `VITE_*` variables in the Vercel project, and
add the production URL to Supabase Auth's redirect allowlist so Client Hub magic links work.
