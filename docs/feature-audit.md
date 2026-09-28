# ContractorHQ — feature audit checklist

Started 2026-09-28. **Steps 1–3 done for the owner role**; employee + Client Hub roles still to test with your sign-in. Report: "Step 3 — report" below.

## How to read this

- Every page, button, link, form, input, dropdown, toggle, dialog, ⋯ menu and action, by area, with what it should do and who sees it.
- **Status** (filled in during Step 2): ✅ works · ❌ broken · ⚠️ works but bad UX · ⏭ not testable here (reason in Note).
- **Calculations** tables list every money/quantity formula as coded (file:line), to be checked by hand.
- **Code observations (unverified)** at the end of each area are things spotted while reading the code — Step 2 confirms or rejects each one.
- Tested at phone width (~390px) and desktop.

## Size

| Area | UI items | Calculations |
|---|---|---|
| 01 Dashboard & app shell (incl. AI assistant) | 371 | 0 |
| 02 Pipeline / CRM / Clients | 280 | 0 |
| 03 Projects, schedule, deliveries | 473 | 0 |
| 04 Cost plan & calculators | 222 | 135 |
| 05 Quotes, Client Selections, change orders | 284 | 86 |
| 06 Invoices, payments, expenses, reports, timesheets | 345 | 112 |
| 07 Settings, Employee role, Client Hub | 403 | 0 |
| **Total (92 routes incl. redirects & public/portal/employee pages)** | **2378** | **333** |

## Step 3 — report (2026-09-28)

**Scope covered live** (desktop + 390px phone sweep of every route): clients → pipeline → site visit → measurements → Cost plan / calculators → quote (Quick Quote, selections, optional items) → share link → sign → Won chain → invoices / payments / voids → change orders (added, credit, client-signed, marked approved) → add-on quote → expenses (split) → order sheet → Bookings / delay job / undo → labor log → dashboard (new + old) → Revenue + 7 detail pages → Business health → Marketing ROI → Settings (Quote defaults, Business profile, Price Book, number limits on every page) → AI assistant (read + write). Every number above was checked by hand; see the log below.

**Result:** 28 fixes (table below; some rows cover several related bugs) — **Critical 9** (1 security on `fix/client-hub-auth`, 6 money, 2 quantity) · **High 11** · **Medium 6** · **Low 2**. 441 tests passing, type-check and lint at baseline. Nothing Critical or High found today is still open.

**Still open — works, but bad UX (not fixed, your call):**
1. Two "actual cost" figures on the project page (Profit card = spent so far; Planned vs actual = materials carried at plan until Complete) — labels don't explain the difference; mid-job, unspent non-material plan (e.g. kitchen $500) reads as "+$500 profit".
2. Raw ISO dates ("2026-09-25") on invoices and Revenue tables.
3. Calculator lines have no material category, so the order sheet is one "Other / Uncategorized" group; bulk tons round up to whole tons (9.5 → 10).
4. Client's add-on quote page is titled "Proposal" with nothing saying it adds to the existing job; Quotes page Deposit tile ignores the add-on's deposit.
5. Change orders: "recorded by" shows the owner's email; "−$250" vs "-$250" signs mixed; Mark approved only after sending.
6. Floating + / assistant buttons cover the right edge of cards on phones until you scroll.
7. Revenue: Invoiced KPI counts 2 while the table lists 4 (drafts); Categories says "incl. Uncategorized" with no such row, "0 jobs" beside revenue.
8. Opportunity title truncated with room to spare; lead source not picked up from the client; decimal feet ("15.5 ft") after ft+in entry; "ft" units get a text box, not the dropdown; Estimate hint says "per project type"; a selection upgrade listed under "Optional items selected".
9. Price Book allows duplicate names without a warning.

**Couldn't test here:**
- Employee (crew) login, timesheets, payroll export, work order — needs a crew login you create and sign in with.
- Client Hub (magic link) — you open the link; also re-check a real client still gets in after 0140.
- Emails: order sheet to supplier (Resend secrets + `send-supplier-email` deploy), any real sends; Text / SMS and mail-app handoffs.
- Order sheet PDF download (browser download).
- Weather forecast flags (job outside the 7-day window, made-up test address).
- Stripe — not in the app (Client Hub phase 4 was skipped).

**Needs you:**
- Deploy `create-employee` (security fix) and `assistant-chat` (the live assistant is an older build: it reported the TEST job's contract as $1,293.75 and a loss; the repo code gets $24,345.75 / $21,071.25 profit) — `env -u SUPABASE_ACCESS_TOKEN supabase functions deploy <name>`.
- Branches `fix/client-hub-auth` and `fix/audit-batch-1` are committed, not merged.

**Settings I changed (left in place):** Quote defaults saved as 35% deposit / 30-day validity, terms now "Prices hold for 30 days…" (the account had no saved defaults before — built-in 50% / 14 days). Price Book: added "TEST — Paver X" ($4.25 / sq ft). Nothing else in Settings was saved (dashboard switch put back to the new dashboard).

## Test data created in the real account (cleanup list)

Every record created for testing is named with the prefix **`TEST —`**. They are listed here as they're created, for deletion at the end.

| Created | Type | Name | Where |
|---|---|---|---|
| 2026-09-28 | Client | TEST — Morgan Delgado | /clients |
| 2026-09-28 | Client | TEST — Priya Shah | /clients |
| 2026-09-28 | Opportunity (Won) + project | TEST — Delgado Backyard | /pipeline/5d3e0a57-6729-4314-9bab-7ee7e1e3a5fb · /projects/ef03095a-1e58-45c1-8288-226502188306 |
| 2026-09-28 | Appointment | Site Visit (completed) on TEST — Delgado Backyard | Appointments |
| 2026-09-28 | Measurements, Cost plan, features | patio, kitchen, 2 seating walls, 2 fire pits | on the TEST project |
| 2026-09-28 | Quote (approved) + Client Selection "Countertop" | on the TEST project | /quotes/a0a94dbc-46b0-47d0-9417-e53d74df3ff8 |
| 2026-09-28 | Invoices | INV-001 (paid), INV-002 ($15,268.63 sent) | on the TEST project |
| 2026-09-28 | Payments | R-0001 $3,000 (void), R-0002 $7,520.37 | on the TEST project |
| 2026-09-28 | Change orders | CO-001 TEST — Extend seating wall 6 ft (+$513, client-signed) · CO-002 TEST — Skip firepit 2 cap upgrade (−$250, marked approved on paper) | on the TEST project |
| 2026-09-28 | Invoices | INV-003 $513 draft (CO-001) · INV-004 $646.88 draft (add-on deposit) | on the TEST project |
| 2026-09-28 | Expenses | TEST — Gravel delivery $1,234.50 (split 1,000 / 234.50) · TEST — Paver pallets $1,200 | on the TEST project |
| 2026-09-28 | Labor entry | TEST — Crew A, 24 h × $35 = $840 (Paver Patio) | on the TEST project |
| 2026-09-28 | Schedule | TEST project booked Oct 12–16 (+ one undone rain delay) | on the TEST project |
| 2026-09-28 | Quote (draft, standalone) | TEST — Defaults check | /quotes/289e876a-bf99-40a0-8955-8d618e097a2a |
| 2026-09-28 | Expense (via assistant) | TEST — Fuel $48.60 | on the TEST project |
| 2026-09-28 | Price Book item | TEST — Paver X ($4.25 / sq ft, Pavers) | /settings/pricebook |
| 2026-09-28 | Add-on quote #1 (approved) + Walkway feature | 45 sq ft × $28.75 = $1,293.75 | /projects/ef03095a-1e58-45c1-8288-226502188306/quotes/d4a46fd4-09c1-4007-b930-550590911234 |


## Live test log (Step 2)

Real browser, your account, TEST — data. ✅ works · ❌ broken (fixed → commit) · ⚠️ works but bad UX.

**Clients** — ✅ create; ❌→fixed preferred contact method dropped on create; ❌→fixed no duplicate check on /clients/new (now: same phone/email → "Open existing / Create anyway", matched a differently formatted phone).
**Pipeline / opportunity** — ✅ New opportunity (client pick, address prefill from client, project types) · ✅ Mark as contacted → Schedule site visit (stage auto-advances) → complete visit (→ Site Visit Done) · ✅ "Add measurements" CTA scrolls + focuses · ✅ "Create cost plan" once measured · ⚠️ title truncated in header ("TEST — Delgado Backyar") with room to spare · ⚠️ opportunity lead source doesn't pick up the client's.
**Measurements** — ✅ 20 ft × 15 ft 6 in = 310 sq ft, perimeter 71 · ✅ kitchen 12′6″ = 12.5 LF, backsplash 12.5×1.5 = 18.75 · ✅ seating walls 26 LF, length-weighted height 18.8 in · ✅ fire pits 4 ft → 12.6 / 12.6, 3′6″ → 11 LF / 9.6 sq ft · ✅ saved + reload · ✅ features grouped · ⚠️ summaries show decimal feet ("15.5 ft") after ft+in entry.
**Cost plan / calculators** — ✅ sections per feature, grouped, General last · ✅ Paver Patio calc by hand (9.5 t base, 2 t bedding, 4 bags, 1 roll, 71 ft, 310 sq ft) · ✅ section total $2,323.50 by hand · ✅ kitchen calc (95/50/20 ft/16 bags/13/3/13, Backsplash line auto-added 19 sq ft +10%) · ✅ seating wall 1 (96 incl. backrest, caps 16, backrest caps 16, base 1 t) / 2 (30, 10, 0.5 t) · ✅ fire pits (57/13/0.5 t, 51) · ❌→fixed **each feature section's calculator prefilled ALL walls combined (26 LF) → double-counted** · ❌→fixed empty "Backrest Caps" line on a wall with no backrest · ⚠️ "ft" units show a free-text box instead of the unit dropdown.
**Quote** — ✅ created per feature from the opportunity · ✅ Quick Quote per section uses the section's own measurement (310 sf×$25, 16 LF×$150, 12.57×$200, 12.5×$450, 10×$150, 11×$200) · ✅ AI description · ✅ totals $21,989 → +$1,200 optional = $23,189 · ✅ deposit 33% = $7,652.37 (cents) · ✅ deposit 150% clamps to 100 · ✅ margin / profit / break-even / price-for-50% by hand · ✅ Client Selection with range "$23,189 – $23,989" · ⚠️ Estimate card hint says "a section per project type" (it's per feature).
**Share link (client)** — ✅ no internal numbers (cost/margin/overhead/internal cost) · ✅ untick optional → saved, survives reload, $22,789 / $7,520.37 · ✅ pick Quartz +$800 · ✅ sign · ⚠️ the $800 selection is listed under "Optional items selected".
**Won chain** — ✅ quote approved, opportunity Won, project Scheduled, deposit INV-001 = $7,520.37 (optional excluded), contract $22,789 · ✅ profit summary cost $2,823.50 incl. Quartz's $500 internal cost.
**Invoices / payments** — ✅ send, "8 days late" · ❌→fixed Record payment: typing a partial amount left the full balance applied and blocked Save · ✅ partial $3,000 → balance $4,520.37, receipt R-0001 · ✅ void → paid in full → restore **refused** (overpay guard) · ✅ delete paid invoice refused · ✅ numbering never re-uses a number in use · ✅ Remaining balance label = created $15,268.63 · ✅ project Invoices page KPIs · ✅ /invoices Overdue filter = 1 · ⚠️ due dates shown as raw "2026-09-25".

**Change orders** — ✅ KPIs before (original = current $22,789) · ✅ builder: feature section, 6 lin ft × $85.50 = $513.00, no tax, revised contract $23,302 · ✅ send → client link shows no internal numbers, "+$513 · Adds 1 working day" · ✅ client signs → approved, list KPIs +$513 / $23,302 / +1 day · ✅ Create invoice → INV-003 $513; second attempt refused (page + API) · ✅ credit CO −$250: total $23,052, margin (23,052 − 2,823.50)/23,052 = 88%, no invoice offered, "Credit — comes off what the client still owes" · ✅ Mark approved dialog: client name prefilled, date defaults today; method/note/who recorded + activity log · ❌→fixed the builder's "Remaining to bill" ignored the drafted CO invoice ($513 shown after INV-003 was drafted) · ❌→fixed project Invoices "Not invoiced yet" ignored drafts ($263 while its own Remaining-balance item makes $0) and never said the invoices ran $250 over the contract after the credit · ⚠️ "recorded by" shows the owner's email, not a name · ⚠️ "−$250" / "-$250" minus signs mixed · ⚠️ Mark approved only appears after sending (SQL allows drafts).
**Add-on quotes** — ✅ Add new work → feature picker (existing ones marked "already on this job") → add-on draft with a Walkway section · ✅ 45 sq ft × $28.75 = $1,293.75, deposit 50% (no saved Quote defaults → 50%) = $646.88 · ❌→fixed an add-on whose features aren't priced in the Cost plan showed Est. cost $0 · Margin 100% · Profit $1,293.75 (header, section chip and True cost panel) — now "Not available" / "Not priced yet" · ✅ send → client signs → approved; contract $24,345.75 = 23,052 + 1,293.75; Walkway feature active; add-on deposit INV-004 $646.88 drafted with the next free number · ✅ Quotes page Signed $24,082.75 (original + add-ons) · ❌→fixed "Signed … in the Client Hub" shown for share-link signatures too (now "online") · ⚠️ the client's add-on page is titled "Proposal" with nothing saying it's added to the existing job · ⚠️ Quotes page Deposit tile shows only the original deposit.

**Phone width (390px)** — overflow sweep (same-origin 390px frame, every element checked against the screen edge, clipped ones included) over dashboard, projects, project page + quotes / change orders / invoices / cost plan / expenses, quote / CO / invoice builders, quotes, invoices, clients, pipeline + opportunity, revenue, business health, bookings, appointments, tasks, communications, timesheets, Cost Plans (/materials), material orders, labor, client view, work order, needs you, portfolio, notifications, all 7 Revenue detail pages, every Settings page (31), new project / client / invoice, and the public quote / invoice / change-order pages · ❌→fixed quote / invoice / change-order builders: the Client + Project card ran off the right edge (names cut, no truncation) · ❌→fixed invoice builder: long "Change order #1 — … · $513.00" add-line buttons ran off the screen · ⚠️ the floating + and assistant buttons cover the right edge of cards (e.g. the project row's move control) until you scroll.
**Deposit rule (found on the phone pass)** — ❌→fixed the pre-construction "Deposit received", the pipeline's deposit-not-received flag and the project billing badge took the deposit % of the whole contract, so the +$513 CO and the add-on turned a fully paid $7,520.37 deposit back to "open" ($8,034 due); now all use the signed quote's deposit, like the deposit invoice.

**Expenses** — ✅ project Expenses: add, feature pick (all 7 features + General), total $2,434.50 · ❌→fixed a pasted amount like "1,234.50" or "$85" left the number field empty (Save just stayed grey; typed commas are dropped by the browser, so typing worked); now accepted · ⚠️→fixed Split dialog lines: same pasted-comma problem; now parsed as $1,000 · ❌→fixed date started blank, so an expense saved without one was left out of "Last 30 days"; now defaults to today · ✅ split 1,000 + "Put the remaining $34.50" → 234.50, adds up, saved as 2 lines · ✅ project Actual cost $2,434.50, actual profit $21,911.25 (90%) by hand · ✅ /expenses list, category counts, inline re-date → Last 30 days $2,434.50 · ⚠️ the project page shows two different "actual" costs: the Profit card's $2,434.50 (spent so far) and Planned vs actual's $4,758 (materials carried at plan until Complete + reconciled, so an uncategorized $1,200 patio expense adds on top of the $2,323.50 plan). Both follow their documented rules, but the labels don't say so · ⚠️ Planned vs actual mid-job shows the kitchen's unspent $500 (non-material) as "+$500 profit".

**Order sheet** — ✅ Generate Order Sheet lists every material line; the sheet combines same-name lines (Wall Block 96 + 30 + 57 + 51 = 234 piece) and adds waste + rounds up (Pavers 310 + 5% = 325.5 → 326 sq ft; Backsplash 19 + 10% → 21) · ❌→fixed the picker showed the raw quantity (310 / 19) while the sheet orders 326 / 21 — now shows what will be ordered · ❌→fixed same-name lines ("Wall Block" ×4, "Caps" ×5) had no feature to tell them apart — each row now names its section · ❌→fixed 0-quantity lines (Border/Edge Pavers, Drainage Gravel, Fire Brick…) were offered — now left out · ❌→fixed Project / job name and Delivery address came up empty on the first open (dialog mounted before the project loaded) — now filled on every open · ⚠️ every calculator line lands in "Other / Uncategorized" (calculators set no material category), so the sheet has one big group · ⚠️ bulk tons round up to whole tons (9.5 → 10) · ⏭ PDF download (browser download) and Email to supplier (Resend not set up).

**Bookings** — ✅ project "Schedule this job" → /bookings with the job under Unscheduled ($24,345.75) · ✅ a real October job with no approved quote shows $0 · 1 job (correct) · ❌→fixed side panel: setting a start date and then an end date wrote the old blank start back (the panel held the job as it was when opened) — start lost, end saved alone, both boxes blank; an end before the start wasn't pulled up either · ✅ after the fix: start 10/12 then end 10/8 (300 ms apart) → 10/12–10/12; end 10/16 saved; header $24,345.75 · 2 jobs, October $24,346 · 2 jobs · ✅ project page Schedule card already saves one field at a time (not affected).

**Delay job (rain delay)** — ✅ preview by working days: 1 → Mon 10/12 → Tue 10/13, Fri 10/16 → Mon 10/19 (weekend skipped); 3 → Thu 10/15 / Wed 10/21 · ✅ 0 and −2 → no preview, Confirm off · ✅ confirm → dates saved, "Delay applied" heads-up step (client has no email → "No email on file · Add"; Text hands off to the phone ⏭) · ✅ Undo from the toast → 10/12–10/16 restored; the Delays list keeps it struck through "· undone" · ⏭ forecast risk flags: the job is outside the 7-day forecast window and the TEST address is made up (and the weather-forecast redeploy is still pending).

**Dashboard** — ✅ new: Collected this month $7.5k (R-0002), Overdue $15.3k (INV-002), Booked this month $24.3k, booked through Oct 31, next 30 days in $1.2k (the two drafts $513 + $646.88; the overdue $15.3k shown separately, by design), Starting soon (2), Needs you, client activity ($23,989 = total at the time of the Quartz pick) · ✅ old: $7,520.37 collected, $15,268.63 unpaid, TEST job $7,520.37 paid · $16,825.38 remaining, Bookings $24,345.75 / Oct $24,346 · 2 jobs · ❌→fixed Needs you "Quote approved — needs deposit · 50% of $0.00" on a $0 quote — a $0 / 0% deposit is no longer asked for, and the item shows the deposit amount ("$3,000.00 (30%)") · ❌→fixed the cash forecast projected a scheduled job's deposit as % of the whole contract (change orders raised it) — now the signed quote's deposit · ✅ "Let the client know about the schedule change" after an undone delay is correct — it's from first scheduling the job, the delay's own update was skipped · dashboard switch put back to the new dashboard after checking the old one.

**Reports** — ✅ Revenue: invoiced $22,789 (drafts excluded), collected $7,520.37, outstanding $15,268.63; by category splits the $7,520.37 by the quote's categorized lines (Paver Patio 7,750 / 21,989 = 35.2% → $2,650.55); by client · ✅ detail pages: Invoiced, Collected (rate 7,520.37 / 22,789 = 33%, aging 1–30 days $15,268.63), Avg. margin / Avg. job (no completed jobs → "—" / $0, consistent), Monthly, Categories, Clients · ⚠️ Invoiced detail: KPI "2 invoices" but the table lists 4 (drafts shown under All statuses) · ⚠️ Categories: "4 incl. Uncategorized" with no Uncategorized row; "0 jobs" beside collected revenue (jobs = completed only) · ⚠️ raw ISO dates in Revenue tables (2026-09-28) · ✅ Business health: backlog $24.3k / 5.4 crew-weeks ((22 + 5) working days ÷ 5), capacity 17/20 · 22/40 · 22/60, "3 open days in the next 3 weeks", cash forecast 30 d $1,159.88 − $4,700 overhead = −$3,540.12, 31–60 d $396.87 (24,345.75 − 23,948.88 invoiced incl. drafts), aging, trends, win rate 2/2 · ✅ Marketing ROI (Pipeline › By source): won revenue $24,345.75, won gross profit $21,911.25 (= 24,345.75 − 2,434.50 expenses), undecided-leads note.

**Labor log / timesheets** — ✅ project Labor log: crew 2 × 1.5 days × 8 h/day fills 24 h; $35/hr → $840 (shown, saved), feature Paver Patio · ✅ actual hrs / 100 sf 24 / 310 = 7.7, $/sf 840 / 310 = $2.71 · ✅ project page: actual cost 2,434.50 + 840 = $3,274.50, actual profit $21,071.25 (87%), fully loaded $20,757.81 (= − 24 h × $13.06 overhead) · ⚠️→fixed typed hours × rate saved unrounded (7.33 × 35.50 = 260.215) — now to the cent · ⏭ Timesheets / payroll: the account has no employees and creating a crew login creates an account — tested with the employee role later.

**Settings › Quote defaults** — ❌→fixed no limits: 150% or −5% deposit and 0-day validity saved (a 150% default would make every new quote fail the 0143 deposit check) — now 0–100% and 1–365 whole days, Save off with the reason shown, also enforced in saveQuoteDefaults · ✅ Revert restores the saved values · ✅ saved 35% / 30 days (+ terms "Prices hold for 30 days") → a new quote pre-fills 35%, the terms, and Valid until Oct 28 (= Sep 28 + 30).

**Settings › number limits (by page)** — ✅ Weather (1–100% / >0 in / 70–130°F), Precon, Business health, Reviews, Payroll and Overhead already validate before saving · ❌→fixed Business profile: a negative default labor rate (→ negative labor costs), an over-order margin over 100% and fractional alert days could be saved — now refused (page + saveBusinessProfile), the leave prompt offers Save / Discard / Stay · (checked with the values put back or discarded — nothing in your settings was changed).

**Settings › Price Book** — ✅ add (name, unit, price, required category), edit, delete with a clear confirm ("lines keep their values, become editable") · ❌→fixed a negative unit price saved (−$4.25) and 0 / negative product specs were accepted (they break order-sheet package rounding) — now refused with the reason · ⚠️ duplicate names allowed ("TEST — Paver X" and "test — paver x") with no warning.

**AI assistant** — ✅ "what has Morgan paid" → $7,520.37 · ❌→fixed (code) outstanding came back $16,428.51 because the drafts were added in (the app says $15,268.63 — drafts aren't owed), and search_invoices never returned payments applied, so a partly paid invoice would read at full amount — the tool now returns paid / balance_owed and outstanding_total / draft_total · ❌ (deploy) "contract / cost / profit on TEST — Delgado Backyard" → contract $1,293.75 (the add-on quote), cost $2,434.50 (no labor), profit −$1,140.75; the app says $24,345.75 / $3,274.50 / $21,071.25. The code in the repo already gets this right (add-ons never the headline, labor included), so the live assistant is running an older deploy of assistant-chat · ✅ write action: "log a $48.60 fuel expense" → proposal card, nothing saved until Confirm, then saved with the right project / amount / date.

**Not yet tested live:** order sheet email (needs Resend); timesheets / payroll (needs an employee login); employee + Client Hub roles (later, with your sign-in).

## Fixed so far (branch `fix/audit-batch-1`; automated test for every math / money fix)

| Severity | What was wrong | Fix | Test |
|---|---|---|---|
| Critical · security | create-employee let any non-employee create a confirmed login for any email; Client Hub trusted email alone | Owner-only + refuses client emails; Hub requires a magic-link session (0140) | `createEmployeeAuthorize.test.ts` |
| Critical · money | Optional items the client unticked on the share link were still billed (and in the deposit) | Share-link choices are saved; sign waits for saves | `sharedQuoteSelection.test.ts` |
| Critical · money | Draft / declined quotes could be signed from their link | `sign_quote` requires status sent (0141); page shows why it can't be signed | — (SQL) |
| Critical · money | Change order builder showed sales tax nobody charged | Removed; total = what's saved and billed; dead Sales tax setting removed | `changeOrderCost.test.ts` |
| Critical · money | A change order could be invoiced twice | One invoice per CO (builder, list, API guard); credits never invoiced | `projectBilling.test.ts` |
| Critical · money | "Remaining balance" menu amount ≠ invoice it created | One helper for both | `projectMoney.test.ts` |
| Critical · quantity | Float noise ordered an extra pallet / showed 584.0999999999999 | Tolerant package rounding, clean ceil | `catalogOrdering.test.ts` |
| Critical · quantity | Mark as ordered saved sq ft / cu yd / ft / roll / tube as "each" → tracker 0 | Delivery units widened (0142) + aliases; row status sees orders | `materialTracking.test.ts` |
| High · quantity | Calculator inputs couldn't be 0; base coverage label wrong unit; waste counted twice | numOr; "per ton at 1 in deep"; waste on the line's Waste % | `smartSectionsMath.test.ts` |
| Critical · money | Restoring a voided payment could overpay an invoice | Refused with the invoice named | `projectMoney.test.ts` |
| High · money | Paid invoices deletable without confirmation; numbers re-used after delete | Confirm + block when paid; max-based numbering (app + SQL 0143) | `invoiceNumbers.test.ts` |
| High · money | "Overdue" never set → filters/counts 0 | Derived status | `financials.test.ts` |
| High · money | Revenue months in UTC, date-only as UTC, monthly Paid by invoice month | Local months/dates; Paid by payment date | `financials.test.ts` |
| High · data | Cost plan / quote save failing partway duplicated lines on retry | Created rows keep real ids after a failure | `draftRemap.test.ts` |
| High · money | Payroll "1.5" saved as 15× overtime; overhead "1,200" saved $0; crew size not retypable | DecimalInput + parseDecimal + limits | `parseDecimal.test.tsx` |
| High · money | Deposit rounded differently per screen; 150% / negative allowed | One depositAmount (cents, 0–100) + DB check (0143) | `projectMoney.test.ts` |
| High · money | Change order "Remaining to bill" and project "Not invoiced yet" ignored draft invoices (invites billing a CO twice); over-billing after a credit CO never flagged | Shared remainingToInvoice everywhere + overInvoiced warning | `changeOrderImpact.test.ts`, `projectMoney.test.ts` |
| High · money | After a change order / add-on, a fully paid deposit read as not received (precon, pipeline flag, billing badge, cash forecast used % of the whole contract); $0 deposits asked for | One headlineDepositDue — the signed quote's deposit | `precon.test.ts`, `businessHealth.test.ts`, `needsYou.test.ts` |
| Medium · money | Expense amounts: pasted "1,234.50" emptied the field; blank date dropped expenses from date totals | parseDecimal + text/decimal inputs; date defaults to today | `parseDecimal.test.tsx` (existing) |
| High · data | Bookings side panel: picking an end date right after a start date erased the start | Patch only the changed field, merged onto the latest dates | — (UI state) |
| High · money | Quote defaults accepted a 150% / negative deposit and 0-day validity (would break every new quote); Business profile accepted a negative labor rate | quoteDefaultsProblem / businessProfileProblem in the page + save | `settingsRules.test.ts` |
| Medium · layout | Builders' Client/Project card and invoice add-line buttons overflowed a phone screen | grid-cols-1 / wrapping buttons | — (layout) |
| Medium · money | Unpriced add-on quote showed $0 cost / 100% margin / full profit | Cost unknown until its features have Cost plan entries | — (display) |
| Medium · quantity | Order sheet picker showed raw quantities (310) while the sheet ordered 326; same-name lines indistinguishable; 0-qty lines offered; job name / address blank on first open | Picker shows the ordered qty + section; 0-qty skipped; fields filled on open | — (UI; math already in `orderSheet.test.ts`) |
| Medium · money | Price Book saved a negative unit price and 0 / negative product specs | Refused with the reason | — (form) |
| Medium · money | AI assistant counted draft invoices as outstanding and ignored payments applied | search_invoices returns paid / balance_owed + totals | — (edge fn; needs deploy) |
| Low · money | Labor log hours × rate saved unrounded | Rounded to the cent | — |
| Low · wording | Share-link signatures labelled "in the Client Hub" | "online" | `projectBilling.test.ts` |

**Needs you:** deploy `create-employee` (`env -u SUPABASE_ACCESS_TOKEN supabase functions deploy create-employee`).

## Verified so far

- **CRITICAL (security) — confirmed by reading `supabase/functions/create-employee/index.ts:84-118`:** any signed-in user who is not an employee (a self-signup owner, or a client's own Client Hub session) can call `create-employee` and get a confirmed login with a password they choose for any not-yet-registered email. The Client Hub identifies a client only by matching the login email to `clients.email`, so this lets someone act as a client who hasn't used the Hub yet (read their quotes/invoices, sign). Not exploited live. **→ FIXED on branch `fix/client-hub-auth`** (needs migration 0140 + `create-employee` redeploy): create-employee is owner-only and refuses client emails (`supabase/functions/create-employee/authorize.ts`, tests in `src/lib/createEmployeeAuthorize.test.ts`); every Client Hub check now requires a magic-link session (`public.portal_email()`, migration 0140) — a matching email alone no longer gets in.

---

## Area 01 — Dashboard & app shell (incl. AI assistant)

Checklist of every user-facing interactive item in the Dashboard (old and new), Needs you, Notifications, Portfolio, 404, the `/` redirect, the app shell (layout, sidebar, mobile tab bar, auth, unsaved-changes guard, DraftSaveBar) and the AI assistant.
This list comes from reading the code only. The **Status** and **Note** columns are left blank and get filled in during click-through testing.

Roles: **Owner** = a normal signed-in account. **Employee** = an account with an `employees` row (it gets the restricted `/employee` shell). **Anyone** = signed out. No page in this file is reachable by a Client-portal user: `/portal` has its own layout.

Shared behaviour to keep in mind (`src/hooks/use-card-link.ts`): a card marked "whole-card tap" goes to its destination when you click anywhere that isn't an inner link or button. Below `md` (phones) every card does this. On desktop only cards marked "desktop too" do. Cmd/Ctrl-click opens a new tab, and selecting text does not navigate.

---

### `/` → redirect (`src/App.tsx:169`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Visit `/` signed in | Route redirect | Replace-navigates to `/dashboard` | Owner | | |
| 2 | Visit `/` signed out | Route | Shows the Auth screen at `/`; after sign-in it lands on `/dashboard` | Anyone | | |
| 3 | Visit `/` as employee | Route | AppLayout redirects to `/employee` | Employee | | |
| 4 | `/backlog` (legacy) | Route redirect | Goes to `/bookings`, keeping `?month=` | Owner | | |
| 5 | `/projects/:id/cost-plan` (legacy) | Route redirect | Goes to `/projects/:id/materials` | Owner | | |

### Auth screen (any route inside AppLayout while signed out) (`src/components/auth/AuthScreen.tsx`, `src/lib/auth.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Loading spinner | State | Centered spinner while the session and role resolve (also on identity change) | Anyone | | |
| 2 | Email | Input (email, required) | Needs a valid email; browser validation | Anyone | | |
| 3 | Password | Input (password, min 6, required) | autocomplete is current-password (sign in) or new-password (sign up) | Anyone | | |
| 4 | Sign in | Submit button | Signs in; if it fails, shows the error inline plus a destructive toast; shows "Please wait…" while pending | Anyone | | |
| 5 | Create one / Sign in | Text button (mode toggle) | Switches between sign-in and sign-up, clearing the error and notice | Anyone | | |
| 6 | Create account | Submit button (sign-up mode) | Creates the account. If email confirmation is needed, switches back to sign-in with a green "Check your email" notice; otherwise signs straight in | Anyone | | |
| 7 | Enter key in a field | Keyboard | Submits the form | Anyone | | |
| 8 | Stay on URL after sign-in | Behaviour | After a successful sign-in the user stays on the URL they were at (deep link preserved) | Anyone | | |
| 9 | Role routing after sign-in | Behaviour | An employee account goes to `/employee`; an owner who is on an `/employee*` URL goes to `/dashboard` | Owner / Employee | | |
| 10 | Cache clear on identity change | Behaviour | Signing out, or in as someone else, clears the react-query cache so the previous user's rows never show | Owner / Employee | | |

### App shell: AppLayout (owner) (`src/components/layout/AppLayout.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Layout frame | Layout | Desktop: 276px fixed sidebar with the content offset (`md:ml-[276px]`). Mobile: bottom tab bar, with main padding-bottom of 6rem plus the draft-bar height | Owner | | |
| 2 | Content width | Layout | Inner content capped at 1200px and centered | Owner | | |
| 3 | Scroll to top on navigation | Behaviour (`ScrollToTop.tsx`) | A link or programmatic navigate scrolls to the top; browser Back/Forward keeps the scroll position | Owner | | |
| 4 | "Going cold" and review checks | Background job | Runs once per browser session for the owner (sessionStorage flag); refreshes notifications and review requests when something changed | Owner | | |
| 5 | Morning checks (precon, maintenance, timesheet reminders, weather risk) | Background job | Runs once per local day (localStorage flag) and refreshes notifications | Owner | | |
| 6 | Employee on an owner URL | Guard | Any non-`/employee` URL redirects to `/employee` | Employee | | |
| 7 | Owner on an `/employee` URL | Guard | Redirects to `/dashboard` | Owner | | |
| 8 | Global toasts | Feedback | Toaster and Sonner mounted app-wide; mutation errors show destructive toasts | Owner | | |
| 9 | Precon refresh on any mutation | Behaviour (`App.tsx` MutationCache) | Every successful mutation invalidates the `["precon"]` queries | Owner | | |

### Sidebar (desktop, `md+`) (`src/components/layout/Sidebar.tsx`, `SidebarUser.tsx`, `navItems.ts`, `src/components/notifications/NotificationsBell.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | "CP / ContractorPro, Business Manager" logo block | Static | Not clickable (no link to the dashboard) | Owner | | |
| 2 | Bell icon (with red unread badge, "9+" cap) | Popover trigger | Opens the notifications popover on the right; the badge counts unread items | Owner | | |
| 3 | Popover: Mark all read | Text button (only when unread > 0) | Marks every notification read; the badge clears | Owner | | |
| 4 | Popover: notification row (latest 12) | Button row | Marks that one read, closes the popover and navigates to its `link` (if any); unread rows are tinted and bold with a blue dot | Owner | | |
| 5 | Popover: empty state | State | "Nothing yet — we'll let you know…" | Owner | | |
| 6 | Popover: See all | Link | Goes to `/notifications` and closes the popover | Owner | | |
| 7 | Notifications polling | Behaviour | Refetches every 60s while the app is open | Owner | | |
| 8 | Overview › Dashboard | NavLink | `/dashboard`; active style (green tint plus left bar) | Owner | | |
| 9 | Work › Projects | NavLink | `/projects` (active on nested routes too) | Owner | | |
| 10 | Work › Cost Plans | NavLink | `/materials` | Owner | | |
| 11 | Work › Quotes | NavLink | `/quotes` | Owner | | |
| 12 | Work › Invoices | NavLink | `/invoices` | Owner | | |
| 13 | Work › Expenses | NavLink | `/expenses` | Owner | | |
| 14 | Work › Timesheets | NavLink | `/timesheets` | Owner | | |
| 15 | Pipeline › Pipeline | NavLink | `/pipeline` | Owner | | |
| 16 | Pipeline › Tasks | NavLink | `/tasks` | Owner | | |
| 17 | Pipeline › Appointments | NavLink | `/appointments` | Owner | | |
| 18 | Pipeline › Communications | NavLink | `/communications` | Owner | | |
| 19 | Money › Revenue | NavLink | `/revenue` | Owner | | |
| 20 | Money › Business health | NavLink | `/business-health` | Owner | | |
| 21 | Business › Clients | NavLink | `/clients` | Owner | | |
| 22 | Business › Settings | NavLink | `/settings` | Owner | | |
| 23 | Ask AI | Button | Opens the AI assistant panel | Owner | | |
| 24 | Nav list scroll | Behaviour | The nav scrolls on its own if the window is short; the user block stays pinned at the bottom | Owner | | |
| 25 | User block (initials, email, "Owner") | Dropdown trigger | Opens the account menu | Owner | | |
| 26 | Account menu › Sign out | Menu item | Signs out, and the Auth screen shows at the current URL | Owner | | |

### Bottom tab bar, FAB and sheets (mobile, `< md`) (`src/components/layout/BottomTabBar.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Home tab | NavLink | `/dashboard`; active pill | Owner | | |
| 2 | Projects tab | NavLink | `/projects` | Owner | | |
| 3 | Quotes tab | NavLink | `/quotes` | Owner | | |
| 4 | Money tab | NavLink | `/revenue` | Owner | | |
| 5 | More tab (red dot when there are unread notifications) | Button | Opens the "More" bottom sheet | Owner | | |
| 6 | Safe-area padding | Layout | The tab bar clears the iPhone home indicator | Owner | | |
| 7 | Floating "+" (Create) button | FAB (52px, bottom-right, above the AI button) | Opens the "Create" bottom sheet | Owner | | |
| 8 | Create › New quote | Action row | Creates a blank quote and goes to `/quotes/:id`; disabled while pending; toast on error | Owner | | |
| 9 | Create › New invoice (on a `/projects/:uuid/...` page) | Action row | `createProjectInvoice` for that project (pre-linked, pre-filled) → `/projects/:id/invoices/:invoiceId` | Owner | | |
| 10 | Create › New invoice (anywhere else) | Action row | Blank invoice → `/invoices/:id` | Owner | | |
| 11 | Create › New project | Action row | Goes to `/projects/new` | Owner | | |
| 12 | Create › Add client | Action row | Goes to `/clients/new` | Owner | | |
| 13 | Create › New change order | Action row | Switches the sheet to the "Change order for…" project picker | Owner | | |
| 14 | Change order › Back chevron | Icon button | Returns to the Create list | Owner | | |
| 15 | Change order › Choose a project | Select | Picking a project closes the sheet and goes to `/projects/:id/change-orders` | Owner | | |
| 16 | Change order › no projects | State | The select opens empty (no empty-state text) | Owner | | |
| 17 | Create sheet close (X / swipe / tap outside / Esc) | Sheet close | Closes and resets the change-order picker step | Owner | | |
| 18 | More › Notifications ("(N new)") | Action row | Goes to `/notifications` | Owner | | |
| 19 | More › Pipeline | Action row | `/pipeline` | Owner | | |
| 20 | More › Tasks | Action row | `/tasks` | Owner | | |
| 21 | More › Appointments | Action row | `/appointments` | Owner | | |
| 22 | More › Communications | Action row | `/communications` | Owner | | |
| 23 | More › Invoices | Action row | `/invoices` | Owner | | |
| 24 | More › Timesheets | Action row | `/timesheets` | Owner | | |
| 25 | More › Business health | Action row | `/business-health` | Owner | | |
| 26 | More › Clients | Action row | `/clients` | Owner | | |
| 27 | More › Settings | Action row | `/settings` | Owner | | |
| 28 | More › Ask AI | Action row | Closes the sheet and opens the AI assistant | Owner | | |
| 29 | More › Sign out | Action row | Closes the sheet and signs out | Owner | | |
| 30 | More › Cost Plans / Expenses | (missing) | Check whether mobile users can reach `/materials` and `/expenses` at all (neither is in the tabs or More) | Owner | | |
| 31 | More sheet close (X / swipe / outside / Esc) | Sheet close | Closes | Owner | | |

### Employee shell (`src/components/layout/EmployeeLayout.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | CP / ContractorPro logo | Link | `/employee` | Employee | | |
| 2 | My time | Link | `/employee/time` | Employee | | |
| 3 | Name button (employee name or "Account") | Dropdown trigger | Opens the account menu | Employee | | |
| 4 | Menu › Change password | Menu item (link) | `/employee/account` | Employee | | |
| 5 | Menu › Sign out | Menu item | Signs out | Employee | | |
| 6 | No sidebar, tab bar, FAB, AI button or bell | Absence check | None of the owner chrome renders for an employee | Employee | | |
| 7 | Direct URL to an owner page (e.g. `/dashboard`, `/notifications`, `/portfolio`) | Guard | Redirects to `/employee` | Employee | | |

### AI assistant (`src/components/assistant/*`, `supabase/functions/assistant-chat/*`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Floating sparkle button | FAB (56px) | Opens the panel. Mobile: bottom-right above the tab bar. Desktop: bottom-right 24px. Hidden while the panel is open | Owner | | |
| 2 | Sidebar "Ask AI" / More › "Ask AI" | Buttons | Open the same panel (see the Sidebar and Tab bar tables) | Owner | | |
| 3 | Panel container | Sheet | Mobile: bottom sheet at 85vh. Desktop: 400px x 70vh card at bottom-right | Owner | | |
| 4 | Panel close X (top-right) / Esc / tap outside | Sheet close | Closes; the conversation is kept in memory until a refresh | Owner | | |
| 5 | Example prompt: "Which quotes haven't I followed up on?" | Button (empty state only) | Sends that question | Owner | | |
| 6 | Example prompt: "What's my margin on my most recent job?" | Button | Sends it | Owner | | |
| 7 | Example prompt: "How much have I spent on expenses this month?" | Button | Sends it | Owner | | |
| 8 | Question box | Textarea | Disabled while a reply is pending | Owner | | |
| 9 | Enter | Keyboard | Sends; blank input is ignored | Owner | | |
| 10 | Shift+Enter | Keyboard | Inserts a newline | Owner | | |
| 11 | Send | Icon button | Sends; disabled while pending or empty | Owner | | |
| 12 | Typing indicator | State | Three bouncing dots while waiting | Owner | | |
| 13 | Auto-scroll | Behaviour | The thread scrolls to the newest message | Owner | | |
| 14 | Error reply | State | A server or network error shows as an assistant bubble ("Something went wrong…" or the server's message) | Owner | | |
| 15 | Daily limit (50 requests / 24h, shared with confirms, Quick Quote descriptions and receipt scans) | Server rule | The 51st request replies "You've hit today's limit of 50 questions…" | Owner | | |
| 16 | Over 2000 characters | Server rule | Replies "Please keep questions under 2000 characters." | Owner | | |
| 17 | Long thread | Server rule | Only the last 16 messages go to the model | Owner | | |
| 18 | Read tools (list_projects, get_project_financials, search_quotes, get_quote_detail, search_invoices, list_expenses, get_client_detail, revenue_summary, get_job_closeouts, get_needs_attention, list_opportunities, get_pipeline_summary) | Server tools | Answers use only the owner's own data (RLS via the caller's JWT); spot-check the numbers against the app | Owner | | |
| 19 | "Log an expense…" request | Proposal card (Log new expense) | Shows Project / Amount / Category (or "Uncategorized") / Date (with "(defaulted to today)" when relevant) | Owner | | |
| 20 | "Create a task…" request | Proposal card (New task) | Shows Title / Customer / Opportunity / Type / Due ("No date") / Priority (only when high) | Owner | | |
| 21 | Action card › Cancel | Button | Status becomes "Cancelled"; nothing is written | Owner | | |
| 22 | Action card › Confirm | Button | "Adding…" or "Creating…", then "Added" or "Created"; the row appears in Expenses / Tasks (check whether those lists refresh without a reload) | Owner | | |
| 23 | Action card › failed | State | Red message such as "That couldn't be saved." | Owner | | |
| 24 | Confirm while another request is pending | Guard | Ignored | Owner | | |
| 25 | Refresh the page | Behaviour | The conversation is cleared (never persisted) | Owner | | |
| 26 | New conversation / clear | (missing) | There is no button; `reset()` exists but is never wired | Owner | | |

### Unsaved-changes guard and DraftSaveBar (`src/components/common/UnsavedChangesProvider.tsx`, `src/hooks/use-unsaved-changes-guard.ts`, `src/components/common/DraftSaveBar.tsx`)

Test on any editor page that uses DraftSaveBar (quote builder, invoice editor, Cost plan sheet, Settings pages).

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | DraftSaveBar appears | Sticky bar | Shows only while there are unsaved edits. Mobile: sits above the tab bar (`bottom-[68px]`). Desktop: bottom, clearing the 276px sidebar | Owner | | |
| 2 | "Unsaved changes" label | Static | Shown from `sm` up; hidden on phones | Owner | | |
| 3 | Discard | Button | Reverts the draft; the bar hides; disabled while saving | Owner | | |
| 4 | Save changes | Button | Saves; shows "Saving…"; the bar hides once clean | Owner | | |
| 5 | Page bottom padding | Behaviour | `--draft-bar-h` is added to the main padding, so the end of the page is never hidden under the bar | Owner | | |
| 6 | Two bars at once (e.g. Measurements card inside a page) | Behaviour | Padding uses the taller of the two | Owner | | |
| 7 | Leave via a sidebar, tab or in-app link while dirty | Guard dialog (desktop AlertDialog) | Title "Save changes before leaving?" with the buttons Save & leave / Discard & leave / Stay | Owner | | |
| 8 | Same on a phone | Guard bottom sheet | Same three buttons, stacked at 48px tall | Owner | | |
| 9 | Save & leave | Button | Saves every dirty editor, then navigates. If the save fails, it stays (the page shows the error). If no save starts within 2.5s, it stays | Owner | | |
| 10 | Discard & leave | Button | Discards the drafts and navigates | Owner | | |
| 11 | Stay | Button / Esc / outside click | Closes the prompt and stays on the page; ignored while saving | Owner | | |
| 12 | Browser Back / swipe-back while dirty | Guard | Same prompt | Owner | | |
| 13 | Query or hash change on the same page | Guard | Never prompts | Owner | | |
| 14 | Save that navigates on success (e.g. a new quote) | Guard | Goes straight through, with no prompt | Owner | | |
| 15 | Close tab, refresh, or type a URL while dirty | Browser prompt | The native "Leave site?" dialog | Owner | | |
| 16 | Sign out while dirty (More › Sign out or the sidebar menu) | Guard (check) | No prompt expected; check whether edits are silently lost | Owner | | |

### Rain delay sheet (app-wide, opened from the dashboard "Delay" / "Rain delay" buttons) (`src/components/schedule/RainDelaySheet.tsx`)

The full schedule-side behaviour belongs to the Schedule audit. These are the entry points from this area only.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Sheet opens | Sheet (right on desktop, bottom on mobile) | "Delay this job · project · crew"; shows "Loading…" or "This job isn't scheduled yet." when relevant | Owner | | |
| 2 | Day affected | Date input | Pre-filled with the risky day; clearing it is ignored | Owner | | |
| 3 | Delay by 1 / 2 / Other | Toggle buttons + number input | "Other" shows a numeric field (1–60 working days; otherwise it shows an error) | Owner | | |
| 4 | Reason chips | Toggle chips | Pick one reason (default rain) | Owner | | |
| 5 | Note | Textarea | Optional | Owner | | |
| 6 | Shift crew's jobs behind it | Switch (only when the job has a crew) | Cascades the shift; without a crew it shows explanatory text instead | Owner | | |
| 7 | Preview list and warnings | State | Per-job change summary, plus locate and overlap warnings | Owner | | |
| 8 | Move delivery checkboxes | Checkbox per affected delivery | Also moves that delivery's date | Owner | | |
| 9 | Appointments › Reschedule | Link button | Goes to the opportunity or `/appointments` and closes the sheet | Owner | | |
| 10 | Cancel | Button | Closes | Owner | | |
| 11 | Confirm delay | Button | Applies it ("Applying…"), then shows the "Delay applied" client heads-up step | Owner | | |

---

### `/dashboard`: Dashboard V1, the original (`src/components/views/DashboardView.tsx`)

Shown when the per-user, per-browser pref `useNew` is false (the default). The pref is stored in localStorage under `chq-dashboard-prefs:<userId>` (`src/components/dashboard2/prefs.ts`).

#### Header and KPIs

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Greeting ("Good morning/afternoon/evening, {first name}") | Static | Based on the local clock; the name is inferred from the email or full name, and dropped if unusable | Owner | | |
| 2 | Mobile date label and initials circle | Static | e.g. "MON 28 SEP"; the initials circle is not clickable | Owner | | |
| 3 | Mobile KPI › Invoiced (this month) | Link card | `/revenue`; horizontally scrollable rail | Owner | | |
| 4 | Mobile KPI › Unpaid (red amount; "N over 30 days" or "N outstanding") | Link card | `/invoices?filter=unpaid` | Owner | | |
| 5 | Mobile KPI › Open quotes ("N awaiting reply") | Link card | `/quotes?filter=open` | Owner | | |
| 6 | Mobile › New opportunity | Primary button | Opens the Create opportunity dialog | Owner | | |
| 7 | Mobile › "Try the new dashboard" | Switch + label (44px) | Turning it on switches to Dashboard V2 (persisted) | Owner | | |
| 8 | Desktop › "New dashboard" | Switch | Same as #7 | Owner | | |
| 9 | Desktop › New invoice | Button | Creates a blank invoice → `/invoices/:id`; disabled while pending; toast on error | Owner | | |
| 10 | Desktop › New quote | Button | Creates a blank quote → `/quotes/:id` | Owner | | |
| 11 | Desktop › New opportunity | Primary button | Opens the Create opportunity dialog | Owner | | |
| 12 | Desktop KPI › This month (collected, with an up/down % vs last month) | Link card | `/revenue`; the % is hidden when last month was $0 | Owner | | |
| 13 | Desktop KPI › Open quotes | Link card | `/quotes?filter=open` | Owner | | |
| 14 | Desktop KPI › Unpaid (red sub-line when there are >30-day items) | Link card | `/invoices?filter=unpaid` | Owner | | |
| 15 | Mobile "This month" revenue card (sparkline, goal bar) | Link card | `/revenue`; the sparkline shows only when there are 2+ months; the goal is DEMO data | Owner | | |
| 16 | Revenue overview chart (desktop only, bottom) | Card (whole-card tap, desktop too) → `/revenue` | Area chart of monthly invoiced amounts with a hover tooltip, total and MoM pill | Owner | | |

#### Card: Weather strip (`src/components/dashboard/WeatherStrip.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | 7 day tiles | Card (whole-card tap, desktop too) → `/bookings` | Temp high/low, rain % scoped to crew hours, qualifier; flagged days are red with a warning icon | Owner | | |
| 2 | Hover a tile | Native tooltip (title) | The flag reason, or the condition label | Owner | | |
| 3 | Mobile horizontal scroll | Behaviour | Tiles scroll sideways | Owner | | |
| 4 | Hidden state | State | Not rendered when the business profile has no address or the weather API fails | Owner | | |

#### Card: Upcoming weather risks (`src/components/dashboard/WeatherRisksCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/bookings` | Hidden when there are no risks in the next 7 days | Owner | | |
| 2 | Risk row "Job · Thu 10/2: summary" | Link | `/projects/:id` | Owner | | |
| 3 | Delay | Button (per row) | Opens the Rain delay sheet for that job and date | Owner | | |

#### Card: Business health one-liner (`src/components/dashboard/BusinessHealthCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | "Booked through {date} · $Xk expected next 30 days · $Yk overdue" | Link card | `/business-health`; "Nothing booked ahead" when empty; the overdue part only shows when > 0; hidden while loading | Owner | | |

#### Card: Updates to review (`src/components/dashboard/UpdatesToReviewCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/projects` | Hidden when there are no pending crew posts | Owner | | |
| 2 | Update row (thumbnail, project, author, photos, milestone, note) | Link | `/projects/:projectId` | Owner | | |
| 3 | Approve & share | Button (44px) | Shares with the client; toast "Shared with the client"; the row disappears | Owner | | |
| 4 | Keep internal | Button (44px) | Toast "Kept internal"; the row disappears | Owner | | |
| 5 | While one is saving | State | Every row's buttons are disabled | Owner | | |

#### Card: Ongoing jobs (`src/components/dashboard/OngoingJobsCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/projects` | Title "Ongoing jobs · N jobs" | Owner | | |
| 2 | View all | Link | `/projects` | Owner | | |
| 3 | Job snapshot card (up to 6) | Link card | `/projects/:id`. Cover photo (or briefcase icon), name, status badge, client, scope, category chips (max 2), contract $, paid bar, "paid · remaining", schedule window and duration (red when over), "Up next", alert badges | Owner | | |
| 4 | Alert badges | Static | Overdue invoice / over duration / CO awaiting / rain / deposit not received / material alert | Owner | | |
| 5 | Mobile swipe row | Behaviour | Horizontal snap scroll with the next card peeking | Owner | | |
| 6 | "+N more" | Link (when there are more than 6) | `/projects` | Owner | | |
| 7 | Empty | State | "No ongoing jobs right now." | Owner | | |

#### Card: Bookings (`src/components/dashboard/BookingsCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/bookings` | "Committed work · {year}" | Owner | | |
| 2 | Title "Bookings ›" | Link | `/bookings` | Owner | | |
| 3 | Previous year | Icon button | Year − 1 (no refetch) | Owner | | |
| 4 | Next year | Icon button | Year + 1 | Owner | | |
| 5 | This year | Text button (only when not on the current year) | Returns to the current year | Owner | | |
| 6 | Season total "$X · N jobs" | Link (only when jobs > 0) | `/bookings` | Owner | | |
| 7 | Month thumbnail (12) | Button + hover tooltip | Click goes to `/bookings?month=YYYY-MM`; hover lists that month's jobs; today ring on the current year; weather-risk icon | Owner | | |
| 8 | Loading | State | "Loading…" | Owner | | |
| 9 | Empty | State + link | "No committed work scheduled yet" with a "Go to pipeline →" link to `/pipeline` | Owner | | |

#### Card: Deliveries, next 14 days (`src/components/dashboard/MaterialDeliveriesCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/projects` | | Owner | | |
| 2 | Delivery row "qty unit description · day · project" | Link | `/projects/:id/material-orders` | Owner | | |
| 3 | Conflict line | State | Red "Job's install month starts before this arrives" | Owner | | |
| 4 | Empty | State | "Nothing expected in the next 2 weeks." | Owner | | |
| 5 | Footer count | Static | "N deliveries" | Owner | | |

#### Card: Appointments, next 7 days (`src/components/dashboard/UpcomingAppointmentsCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/appointments` | Grouped by local day, with the today row tinted | Owner | | |
| 2 | View all | Link | `/appointments` | Owner | | |
| 3 | Appointment row | Button | Opens the "Appointment" detail dialog | Owner | | |
| 4 | Client name in the row | Inline link | `/clients/:clientId` (does not open the dialog) | Owner | | |
| 5 | Project name in the row | Inline link | `/projects/:id` | Owner | | |
| 6 | Forecast chip (site visit / estimate only) | Static chip | Weather for that appointment (not interactive here) | Owner | | |
| 7 | "+N more this week" | Link | `/appointments` | Owner | | |
| 8 | Empty › Schedule one | Text button | Opens the New appointment dialog | Owner | | |
| 9 | Detail dialog › Completed checkbox (scheduled or completed only) | Checkbox | Marks it completed (logs activity, may advance the site-visit stage), or un-completes it | Owner | | |
| 10 | Detail dialog › Edit | Button | Opens Edit appointment (Type select, Date, Time [optional, 15-min step], Notes, Save changes) | Owner | | |
| 11 | Detail dialog › Cancel (scheduled only) | Button | Sets the status to cancelled | Owner | | |
| 12 | Detail dialog › Start estimate → (completed site visit) | Button | Creates a standalone quote for the client → `/quotes/:id` | Owner | | |
| 13 | Detail dialog › Forecast chip | Chip (interactive) | Opens the forecast popover | Owner | | |
| 14 | Detail dialog close | X / Esc / outside | Closes | Owner | | |
| 15 | New appointment › Type | Select | Site visit (default) or the other types | Owner | | |
| 16 | New appointment › Date | Date input | Defaults to today (or tomorrow late at night) | Owner | | |
| 17 | New appointment › Time | Time input | Defaults to the next half hour; clearing it makes a date-only appointment | Owner | | |
| 18 | New appointment › Notes | Textarea | Optional | Owner | | |
| 19 | New appointment › Customer | Client combobox | Search, "Add "x" as new client", new-client fields (Name/Phone/Email/Address), duplicate warning with Use existing / Create anyway, clear X | Owner | | |
| 20 | New appointment › Create appointment | Button | Disabled until there is a client and a date; the address is auto-filled from the client | Owner | | |

#### Card: Estimating insights banner (`src/components/dashboard/EstimatingInsightsBanner.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | "N estimating insights from your completed jobs ›" | Link banner | `/settings/estimating-insights`; hidden when there are 0 | Owner | | |

#### Card: Follow-ups (`src/components/dashboard/FollowUpsCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, desktop too) → `/tasks` | "Follow-ups · N" (overdue + due today) | Owner | | |
| 2 | Task row (up to 6; "Overdue" or "Today" pill) | Link | `/tasks` (not the specific task) | Owner | | |
| 3 | Empty | State | "No overdue or due-today follow-ups." | Owner | | |

#### Card: Needs you (`src/components/dashboard/NeedsYou.tsx`, rows from `src/lib/needsYou.ts`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/needs-you` | "Needs you · N", top 5 | Owner | | |
| 2 | View all | Link (only when there are more than 5) | `/needs-you` | Owner | | |
| 3 | Row: Invoice N days late › Remind | Link row | `/invoices/:id` | Owner | | |
| 4 | Row: Quote shared N days ago / going cold › Follow up | Link row | `/quotes/:id` | Owner | | |
| 5 | Row: Quote approved, needs deposit › Bill | Link row | `/quotes/:id` | Owner | | |
| 6 | Row: Confirm site visit › Confirm | Link row | `/pipeline/:oppId` | Owner | | |
| 7 | Row: Change request from … › Review | Link row | `/projects/:id` | Owner | | |
| 8 | Row: Change order waiting N days › Follow up | Link row | `/projects/:id/change-orders/:coId` | Owner | | |
| 9 | Row: $X unapplied credit › Apply | Link row | `/projects/:id` (or `/invoices` with no project) | Owner | | |
| 10 | Row: Task (overdue or due today) › Open | Link row | `/tasks` | Owner | | |
| 11 | Row: N crew updates to review › Review | Link row | `/dashboard#crew` (check that it scrolls anywhere) | Owner | | |
| 12 | Row: N timesheets waiting › Review | Link row | `/timesheets` | Owner | | |
| 13 | Row: Let the client know about the schedule change › Send | Link row | `/projects/:id` | Owner | | |
| 14 | Row: N estimating insights › Review | Link row | `/settings/estimating-insights` | Owner | | |
| 15 | Rows from review / precon / maintenance modules | Link rows | Each goes to its own feature page | Owner | | |
| 16 | Empty | State | "Nothing needs your attention." | Owner | | |

#### Card: Maintenance due (`src/components/dashboard/MaintenanceDueCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/projects` | Hidden until at least one reminder exists | Owner | | |
| 2 | Group headings Overdue (red) / This month / Next month | Static | | Owner | | |
| 3 | Reminder row (client, label, project, month) | Link | `/projects/:id?maintenance=:itemId` | Owner | | |
| 4 | Stats strip: Due this yr / Reached out / Converted x/y / Revenue | Static | | Owner | | |
| 5 | Empty groups | State | "No past clients due this month or next." | Owner | | |

#### Card: Recent activity (`src/components/dashboard/RecentActivity.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/notifications` | Last 6 quote, invoice and payment events | Owner | | |
| 2 | Quote row | Link | `/quotes/:id` | Owner | | |
| 3 | Invoice row | Link | `/invoices/:id` | Owner | | |
| 4 | Payment row | Link | `/projects/:id`, or the public `/receipt/:token` when there is no project | Owner | | |
| 5 | Empty | State | "No activity yet." | Owner | | |

#### Card: Recent quotes / Recent invoices (`src/components/dashboard/RecentQuotes.tsx`, `RecentInvoices.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Recent quotes card | Card (whole-card tap, mobile) → `/quotes` | The 5 most recently updated | Owner | | |
| 2 | Recent quotes › View all | Link | `/quotes` | Owner | | |
| 3 | Quote row (project or "Standalone quote", status icon, client, total, time ago) | Link | `/quotes/:id` | Owner | | |
| 4 | Recent quotes empty | State | "No quotes yet." | Owner | | |
| 5 | Recent invoices card | Card (whole-card tap, mobile) → `/invoices` | The 5 most recently updated | Owner | | |
| 6 | Recent invoices › View all | Link | `/invoices` | Owner | | |
| 7 | Invoice row | Link | `/invoices/:id` | Owner | | |
| 8 | Recent invoices empty | State | "No invoices yet." | Owner | | |

#### Dialog: Create opportunity (from either dashboard) (`src/components/common/CreateOpportunityDialog.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Dialog | Dialog (full-height on phones) | "New opportunity"; body scrolls while header and footer stay fixed | Owner | | |
| 2 | Client | Client combobox (autofocus) | Search name/email/phone, arrow keys and Enter, "Add "x" as new client", new-client fields, Cancel new client, duplicate warning (Use existing / Create anyway), Clear client X | Owner | | |
| 3 | Title | Input | Required | Owner | | |
| 4 | Job site address | Input | Pre-fills from the client's address until edited; helper text changes to match | Owner | | |
| 5 | Project types | Multi-select | Optional | Owner | | |
| 6 | Lead source | Select | Optional | Owner | | |
| 7 | Cancel | Button | Closes | Owner | | |
| 8 | Create opportunity | Button | Disabled until there is a client and a title; shows "Creating…"; goes to `/pipeline/:id` | Owner | | |

---

### `/dashboard`: Dashboard V2, the new one (`src/components/dashboard2/DashboardV2.tsx`)

Shown when `useNew` is true. Desktop is a 2-column grid (each card has a fixed left or right column). Mobile is a single column with Today → Needs you → Starting soon → Client activity first, then the rest in the user's order. Below-the-fold cards lazy-mount (they show a pulse placeholder until you scroll near them). A card that crashes shows "{Card} couldn't load. Try again".

#### Header, actions, customize

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Greeting and date | Static | | Owner | | |
| 2 | "New dashboard" | Switch (on) | Turning it off goes back to V1 (persisted) | Owner | | |
| 3 | Customize (sliders icon) | Icon button (44px) | Opens the Customize sheet (right on desktop, bottom on mobile) | Owner | | |
| 4 | New opportunity | Primary button | Opens the Create opportunity dialog | Owner | | |
| 5 | New quote | Button | Blank quote → `/quotes/:id` | Owner | | |
| 6 | New invoice | Button | Blank invoice → `/invoices/:id` | Owner | | |
| 7 | Record payment | Button | Opens the Record payment modal (no project; it lists every sent or overdue invoice) | Owner | | |
| 8 | Customize › Headline numbers | Switch | Shows or hides the headline strip | Owner | | |
| 9 | Customize › card row "Label (left/right)" | Row | One row per card (15 cards) | Owner | | |
| 10 | Customize › Move up | Icon button | Swaps with the previous card in the global order; disabled on the first | Owner | | |
| 11 | Customize › Move down | Icon button | Swaps with the next; disabled on the last | Owner | | |
| 12 | Customize › Show card | Switch | Hides or shows that card (Recent activity, Recent quotes and Recent invoices are hidden by default) | Owner | | |
| 13 | Customize › Reset to default | Button | Restores the default order, hidden set and headline | Owner | | |
| 14 | Customize close | X / Esc / outside | Closes; changes are already saved (this browser only) | Owner | | |
| 15 | Record payment › Amount | Input ($) | Autofocus; required > 0 | Owner | | |
| 16 | Record payment › Date received | Date input | Defaults to today | Owner | | |
| 17 | Record payment › Method | Toggle chips | Check (default) and the other methods | Owner | | |
| 18 | Record payment › Check # / Reference | Input | The label changes with the method | Owner | | |
| 19 | Record payment › Note | Textarea | Internal only | Owner | | |
| 20 | Record payment › Apply to invoice | Checkbox | Disabled with "· no open invoices" when there are none | Owner | | |
| 21 | Record payment › per-invoice amount | Inputs | Can't exceed the invoice's open balance (error message) | Owner | | |
| 22 | Record payment › Fill oldest first | Text button | Auto-allocates the amount, oldest first | Owner | | |
| 23 | Record payment › credit / over line | State | "$X stays as project credit" or a red "$X over" | Owner | | |
| 24 | Record payment › Cancel | Button | Closes | Owner | | |
| 25 | Record payment › Record $X | Submit | Toast "Payment recorded · Receipt created"; money queries refresh | Owner | | |

#### Headline strip (`SummaryCards.tsx` HeadlineStrip)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Collected this month | Link tile | `/revenue/collected` | Owner | | |
| 2 | Overdue ("needs chasing" / "all current") | Link tile | `/invoices` | Owner | | |
| 3 | Booked this month (▲/▼ % vs last year) | Link tile | `/business-health` | Owner | | |
| 4 | Booked through (date, "$ backlog") | Link tile | `/business-health` | Owner | | |
| 5 | Next 30 days in ("net $") | Link tile | `/business-health` | Owner | | |
| 6 | Mobile swipe, loading pulse | Behaviour / state | Snap scroll; pulse bars while loading | Owner | | |

#### Card: Today (Weather strip + `TodayCard.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Weather strip | Card → `/bookings` | Same as V1 (hidden when there is no address) | Owner | | |
| 2 | Today card | Card (whole-card tap, mobile) → `/bookings` | "Today · {date} · N jobs"; skeleton while loading | Owner | | |
| 3 | Schedule | Link | `/bookings` | Owner | | |
| 4 | Job row (crew · name, STARTS tag, address) | Link | `/projects/:id` | Owner | | |
| 5 | Job forecast text | Static | Risk summary (coloured), or "label · rain %" | Owner | | |
| 6 | Readiness pill (starts today only) | Static + tooltip | Ready / "N open"; hover lists the open items | Owner | | |
| 7 | "X clocked in" pill | Static | | Owner | | |
| 8 | Delivery pills | Static | Today's deliveries for that job | Owner | | |
| 9 | Work order | Link | `/projects/:id/work-order` | Owner | | |
| 10 | Rain delay | Button (risky day only) | Opens the Rain delay sheet for today | Owner | | |
| 11 | Appointment row (type, time or "All day", address, forecast) | Link | `/pipeline/:oppId`, or `/appointments` | Owner | | |
| 12 | Empty › "Nothing scheduled today. Next work day: {date} · {job}" | State + link | The job link goes to `/projects/:id` | Owner | | |

#### Card: Needs you (`ActionCards.tsx` NeedsYouCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/needs-you` | "Needs you · N"; skeleton while loading | Owner | | |
| 2 | View all | Link (only when there are more than 5) | `/needs-you` | Owner | | |
| 3 | Filter chips All / Jobs / Money / Clients / Crew (with counts; empty categories hidden; the whole row is hidden when there are ≤ 1 categories) | Tabs | Filter the top 5 | Owner | | |
| 4 | Rows | Link rows | Same row kinds as V1 Needs you (#3–15) | Owner | | |
| 5 | Empty | State | "Nothing needs you right now." | Owner | | |

#### Card: Starting soon (`ActionCards.tsx` StartingSoonCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/bookings` | Jobs starting in the next 14 days (after today); hidden when there are none | Owner | | |
| 2 | Schedule | Link | `/bookings` | Owner | | |
| 3 | Job row (name, start date, readiness pill, crew, day-one forecast, materials pill) | Link | `/projects/:id` | Owner | | |
| 4 | Materials pill states | Static | Materials in / Materials on order / Delivery after start | Owner | | |

#### Card: Client activity (`ActionCards.tsx` ClientActivityCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/notifications` | Hidden when there is no activity in 14 days and no cold quotes | Owner | | |
| 2 | View all | Link | `/notifications` | Owner | | |
| 3 | Going-cold quote row (snowflake, label, total; top 3) | Link | `/quotes/:id` | Owner | | |
| 4 | Engagement row (opened / viewed again / selections / approved / declined / comment / review click / maintenance request) | Link | The notification's link, or `/notifications` (does not mark it read) | Owner | | |

#### Card: This week (`ActionCards.tsx` ThisWeekCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/appointments` | The next 6 days (excluding today), grouped by day | Owner | | |
| 2 | Appointments | Link | `/appointments` | Owner | | |
| 3 | Appointment row | Link | `/pipeline/:oppId`, or `/appointments` | Owner | | |
| 4 | Delivery row ("after start" flag) | Link | `/projects/:id/material-orders` | Owner | | |
| 5 | Empty | State | "No appointments or deliveries in the next 6 days." | Owner | | |

#### Card: Weather risks / Ongoing jobs

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Weather risks | Card | Same as the V1 card (rows, Delay button) | Owner | | |
| 2 | Ongoing jobs | Card | Same as the V1 card (snapshot cards, View all, +N more) | Owner | | |

#### Card: Pipeline (`ActionCards.tsx` PipelineCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, desktop too) → `/pipeline` | "Pipeline · N open" | Owner | | |
| 2 | View all | Link | `/pipeline` | Owner | | |
| 3 | Stage rows (label · count, $ value) | Static | Only stages with count > 0 | Owner | | |
| 4 | Weighted total | Static | Sum of value × stage probability (Settings › Business health) | Owner | | |
| 5 | New leads this week by source | Static | | Owner | | |
| 6 | Empty | State | "No open leads." | Owner | | |

#### Card: Crew & time (`SummaryCards.tsx` CrewTimeCard + UpdatesToReviewCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card (`id="crew"`) | Card (whole-card tap, desktop too) → `/timesheets` | Hidden when there are no active employees; "N clocked in" | Owner | | |
| 2 | Timesheets | Link | `/timesheets` | Owner | | |
| 3 | Clocked-in rows (name · project, "since") | Static | Refreshes every 60s; "Nobody's clocked in right now." when empty | Owner | | |
| 4 | This week / Last week hours | Static | The workweek starts on the day set in Settings › Payroll | Owner | | |
| 5 | Waiting (amber when > 0) | Link | `/timesheets` | Owner | | |
| 6 | Overtime watch rows | Static | Employees within 5h of the OT limit (red once at or over it) | Owner | | |
| 7 | Updates to review (below) | Card | Same as V1 (Approve & share / Keep internal) | Owner | | |

#### Card: Money (MoneyCard + Bookings + Revenue chart)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Money card | Card (whole-card tap, desktop too) → `/business-health` | Skeleton while loading | Owner | | |
| 2 | Business health | Link | `/business-health` | Owner | | |
| 3 | Receivables aging bars | Static | Current (green) / 1–30 (amber) / older (red) | Owner | | |
| 4 | In · Out · Net 30 days | Static | | Owner | | |
| 5 | Bookings card | Card | Same as V1 (year nav, month thumbnails) | Owner | | |
| 6 | Revenue overview (desktop only) | Card | Same as V1 | Owner | | |

#### Card: Past clients (`SummaryCards.tsx` PastClientsCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/projects` | Hidden when there are no due reminders and no review requests | Owner | | |
| 2 | View all | Link | `/projects` | Owner | | |
| 3 | Maintenance row (up to 4; month red when overdue) | Link | `/projects/:id?maintenance=:itemId` | Owner | | |
| 4 | Review stats To ask / Asked / Clicked / Left | Link strip | `/settings/reviews` | Owner | | |
| 5 | "N reviews left in the last 30 days" | Static | | Owner | | |

#### Card: Insights (`SummaryCards.tsx` InsightsCard)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Card | Card (whole-card tap, mobile) → `/settings/estimating-insights` | Hidden when there are no recommendations and no marketing data | Owner | | |
| 2 | View all | Link (only when there are recommendations) | `/settings/estimating-insights` | Owner | | |
| 3 | Insight headline rows (up to 2) | Link | `/settings/estimating-insights` | Owner | | |
| 4 | Marketing line "This month: N leads · $ spent · cost per won job · ROAS" | Link | `/pipeline` | Owner | | |

#### Optional cards (hidden by default): Recent activity / Recent quotes / Recent invoices

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Turn each on in Customize | Behaviour | Renders the same component as V1 (rows, View all, empty state) | Owner | | |

---

### `/needs-you`: Needs you (`src/components/views/NeedsYouView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Mobile header "Needs you" with back "Dashboard" | BackLink | Goes back (or to `/dashboard`) | Owner | | |
| 2 | Desktop "Dashboard" back link | BackLink | Same | Owner | | |
| 3 | Subtitle "N items needing attention, most urgent first" | Static | | Owner | | |
| 4 | Filter chips All / Jobs / Money / Clients / Crew (counts; hidden when there are ≤ 1 categories) | Tabs | Filter the full, uncapped list | Owner | | |
| 5 | Rows (every kind listed under V1 Needs you) | Link rows | Each goes to its `href`; the right-hand pill shows the action label | Owner | | |
| 6 | Empty | State | "Nothing needs your attention." | Owner | | |
| 7 | Consistency | Check | The count and order match the dashboard Needs you cards | Owner | | |

### `/notifications`: Notifications (`src/components/views/NotificationsView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Mobile header "Notifications" | Static | No back link | Owner | | |
| 2 | Mark all read | Button (only when unread > 0) | Marks all read; the bell badge and More-tab dot clear | Owner | | |
| 3 | Notification row (latest 40; icon by kind; unread tinted, bold, blue dot) | Button row | Marks it read and navigates to its link if there is one (otherwise it stays on the page, now read) | Owner | | |
| 4 | Kinds to cover | Check | quote first open / viewed again / selections / approved / declined, weather risk, review eligible / clicked, precon overdue / ready / locate expiring, maintenance due / request, timesheet submitted / waiting, progress review / comment | Owner | | |
| 5 | Empty | State | "Nothing yet — we'll let you know…" | Owner | | |
| 6 | More than 40 | Check | No pagination or "load more" | Owner | | |

### `/portfolio`: Portfolio (`src/components/views/PortfolioView.tsx`)

Reached from Settings › Portfolio (not in the sidebar). Items are created by "Save pair to portfolio" on a project's Before & after.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Back "Settings" (mobile header and desktop link) | BackLink | Goes back to `/settings` | Owner | | |
| 2 | Pair card (Before / After images, title or project name) | Static | | Owner | | |
| 3 | Download | Button | Downloads 2 JPEGs (before and after) with EXIF/GPS removed; toast "Download failed" on error | Owner | | |
| 4 | Remove | Button (red) | Removes the pair from the portfolio, with no confirmation | Owner | | |
| 5 | Empty | State | "Nothing saved yet — use "Save pair to portfolio"…" | Owner | | |

### `*`: 404 NotFound (`src/pages/NotFound.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Unknown URL (e.g. `/foo`) | Route | Full-screen "404 · Oops! Page not found" outside the app shell (no sidebar or tab bar) | Anyone | | |
| 2 | Return to Home | Link | `/dashboard` (the Auth screen if signed out; `/employee` for an employee) | Anyone | | |
| 3 | Unknown nested URL under a known prefix (e.g. `/projects/abc/xyz`) | Route | Also 404 | Owner | | |
| 4 | Invalid id on a real route (e.g. `/quotes/not-a-uuid`) | Route | Not a 404; that page's own not-found or error state (check each) | Owner | | |

---

### Code observations (unverified)

These are **unverified**. They come from reading the code, and none has been confirmed in the running app.

#### Likely bugs or math

1. `src/components/dashboard2/SummaryCards.tsx:273`: `wonMoney: () => null`, so `wonRevenue` is always 0 and the Insights card's "ROAS" (`:300`) always reads 0.0x once there is spend. The cost per won job may also disagree with the Marketing ROI page.
2. `src/components/dashboard/FollowUpsCard.tsx:8`: "today" comes from `toISOString()` (UTC), and `due_at.slice(0,10)` is compared in UTC. In the US evening, tomorrow's tasks can show as "Today" and today's as "Overdue". This is the same UTC/local bug fixed elsewhere.
3. `src/components/dashboard/UpcomingAppointmentsCard.tsx:149-155`: the dialog renders a snapshot `openAppointment` from state. After Complete, Cancel or Edit inside the dialog, the row stays stale until the dialog is reopened.
4. `src/components/dashboard/UpcomingAppointmentsCard.tsx:84-136`: `<Link>` elements (client, project) are nested inside a `<button>`. That is invalid HTML (interactive content inside a button) and can misfire clicks and keyboard focus.
5. `src/lib/needsYou.ts:194`: the "crew updates to review" row links to `/dashboard#crew`. V1 has no `id="crew"`. In V2 the crew card is lazy-mounted (`DashboardV2.tsx:33`, not eager), can be hidden by Customize, and React Router doesn't scroll to hashes anyway. The button likely does nothing when you are already on /dashboard.
6. `src/components/assistant/AssistantProvider.tsx:70`: a confirmed `create_expense` / `create_task` never invalidates react-query (`["expenses"]`, `["tasks"]`), so Expenses and Tasks lists and dashboard cards stay stale until a refetch.
7. `supabase/functions/assistant-chat/index.ts:477`: a usage-log row is inserted before any validation, so invalid, over-length and failed requests all use up the 50/day quota.
8. `src/components/dashboard/RecentActivity.tsx:88,98`: items are sorted and timed by `created_at` but titled with the *current* status ("Invoice paid", "Quote approved"). An old invoice that was just paid shows "Invoice paid · 3 months ago" and may not appear at all.
9. `src/components/dashboard/MaintenanceDueCard.tsx:26`: the stats use `items` (including opted-out clients), while the lists use the filtered `live`, so the counts can disagree.
10. `src/hooks/use-notifications.ts:9,16`: only 40 notifications are fetched. The unread badge counts unread items within those 40, so older unread items are invisible and never counted.
11. `src/components/dashboard2/DashboardV2.tsx:125-132`: Customize Move up/down swaps positions in one global order, but desktop splits cards into fixed left and right columns. Moving a left card past a right card has no visible effect on desktop, and the up/down disabled states don't match what is shown.
12. `src/components/dashboard2/DashboardV2.tsx:192-196`: Record payment from the dashboard uses `projectId={null}` and lists invoices from every project. One payment applied across several projects' invoices would have no project, and unapplied money becomes "credit" with no project (the Needs-you row then links to `/invoices`).
13. `src/components/dashboard/BookingsCard.tsx:22`: `CURRENT_YEAR` is a module-level constant, so a tab left open over New Year keeps the old year (minor).
14. `src/components/views/DashboardView.tsx:108,287`: the mobile "This month" card shows `DEMO_REVENUE_GOAL` (fake data) as though it were the user's real goal ("% of $X goal", "$ to go"), and nothing in Settings sets it.

#### Missing loading, empty or error states

15. `src/components/views/NeedsYouView.tsx:29,34`: no loading state, so it shows "0 items" and "Nothing needs your attention." while the queries load. The V1 Needs you card (`NeedsYou.tsx:31`) does the same, while V2 has a skeleton.
16. `src/components/views/NotificationsView.tsx:24` and `NotificationList.tsx:38`: no loading or error state. The empty copy shows while loading, and the copy only mentions quotes and weather.
17. `src/components/views/PortfolioView.tsx:45`: the empty message shows while loading. Remove (`:73`) has no confirmation, no error toast and no pending state.
18. `src/components/dashboard/MaterialDeliveriesCard.tsx:32`, `FollowUpsCard.tsx:30`, `RecentActivity.tsx:121`, `RecentQuotes.tsx:41`, `RecentInvoices.tsx:37`, `OngoingJobsCard.tsx:193`: no loading state, so the empty copy flashes on first paint.
19. `src/components/dashboard/BusinessHealthCard.tsx:12`: returns null while loading, so the layout jumps. It also reads `h.cash.periods[0]` (`:14`) without a guard, as does HeadlineStrip (`SummaryCards.tsx:55`).
20. `src/lib/assistant.ts:71`: on a non-2xx response (server_error 500, unauthorized 401) `functions.invoke` gives a generic "non-2xx" error, so the user sees that instead of the function's real message.
21. `src/components/layout/BottomTabBar.tsx:168-185`: the "Change order for…" select has no empty state when there are no projects.

#### Mobile layout risks

22. `src/components/assistant/AssistantButton.tsx:19` vs `src/components/common/DraftSaveBar.tsx:55`: both are `z-40`. The 56px AI button (bottom 72px, right 16px) sits over the DraftSaveBar (bottom 68px, about 64px tall) and likely covers the right-hand "Save changes" button on phones. On narrow desktops (bottom-6 right-6) it may overlap the bar's right edge too.
23. `src/components/common/DraftSaveBar.tsx:55`: on mobile `bottom-[68px]` is fixed, but the tab bar grows with `env(safe-area-inset-bottom)` (`BottomTabBar.tsx:115`). On notched iPhones the bar's bottom ~26px may sit under the tab bar (z-50).
24. `src/components/layout/BottomTabBar.tsx:140` and `AssistantButton.tsx:19`: two stacked floating buttons on the right cover content from about 72px to 192px above the bottom, while `<main>` only pads 96px (`AppLayout.tsx:106`). The last row's right-side controls on long pages can sit under the FAB.
25. Tap targets under 44px: Bookings year chevrons (`BookingsCard.tsx:92-108`, about 24px) and "This year"; the NeedsYou filter chips (`NeedsYouChips.tsx:20`, 32px); the Weather-risk "Delay" button (`WeatherRisksCard.tsx:48`, h-8); Today "Work order" and "Rain delay" (`TodayCard.tsx:173,177`, 32px); appointment dialog Edit and Cancel (`AppointmentsView.tsx`, h-7); inline client and project links in appointment rows; the sheet close X (`ui/sheet.tsx:60`, 16px icon); the Bell (36px, desktop only); the Auth "Create one" toggle; the Customize move buttons (36px).
26. `src/components/dashboard2/DashboardV2.tsx:135`: adds its own `pb-24` on top of main's bottom padding, which doubles the empty space at the bottom (minor).

#### Navigation gaps and naming

27. `src/components/layout/BottomTabBar.tsx:207-236`: the mobile "More" sheet has no **Cost Plans** (`/materials`) and no **Expenses** (`/expenses`), so phone users can't reach those list pages from the navigation. It also hard-codes its own list instead of using `navItems.ts`, so the two will drift.
28. `CLAUDE.md` (Navigation & shell) describes the tab bar as "Home / Projects / center FAB / Money / More". The code is Home / Projects / Quotes / Money / More, with the FAB floating at bottom-right. The doc is out of date.
29. Brand naming: the sidebar, auth screen and employee header all say "ContractorPro" (`Sidebar.tsx:25`, `AuthScreen.tsx:60`, `EmployeeLayout.tsx:28`) while the repo and product are ContractorHQ. Confirm which is intended.
30. Route vs label: the "Cost Plans" nav item points at `/materials` (`navItems.ts:33`), and `/projects/:id/cost-plan` redirects to `/projects/:id/materials` (`App.tsx:125`). Old "materials" wording survives in URLs and in some copy ("Deliveries", material-orders). Check visible titles on those pages say "Cost plan".
31. Needs-you action labels promise actions the link doesn't perform: "Remind" opens the invoice (`needsYou.ts:79`), "Bill" opens the quote (`:262`), and "Apply" opens the project (`:166`). Task rows (`:181`) and FollowUps rows (`FollowUpsCard.tsx:39`) go to `/tasks`, not the task itself.
32. Whole-card tap destinations that don't match the card: Maintenance due, Deliveries and Updates to review go to `/projects` (`MaintenanceDueCard.tsx:17`, `MaterialDeliveriesCard.tsx:17`, `UpdatesToReviewCard.tsx:13`), and Recent activity goes to `/notifications` (`RecentActivity.tsx:75`), which is a different feed.
33. `src/components/dashboard/BookingsCard.tsx:133`: the empty-state copy says jobs show "once they have a target install month", but the card's doc comment (`:26`) says the grouping is by `scheduled_start_date`. Check which field actually drives it.
34. `src/components/dashboard/RecentActivity.tsx:112`: a payment with no project links to the public `/receipt/:token` page, which takes the owner out of the app shell.
35. `src/components/dashboard2/SummaryCards.tsx:47`: the headline "Overdue" tile links to unfiltered `/invoices`, while V1's Unpaid KPI uses `/invoices?filter=unpaid`.

#### Permissions and auth

36. `src/lib/auth.tsx:31-38`: if the `employees` lookup fails (network hiccup), an employee resolves to role "owner" and gets the full owner shell (only RLS protects the data). Worth testing with a slow or failed request.
37. `src/components/auth/AuthScreen.tsx:109-121`: public self-sign-up is open to anyone and creates a new owner account, and there is no "Forgot password" flow anywhere on the screen.
38. `src/components/common/UnsavedChangesProvider.tsx:45-48`: the guard only blocks router navigations. Signing out (`BottomTabBar.tsx:235`, `SidebarUser.tsx:32`) swaps the page to AuthScreen without navigating, so dirty drafts are silently discarded with no prompt (though `beforeunload` stays registered).
39. `supabase/functions/assistant-chat/index.ts:484-488`: `execute_action` runs whatever `action` payload the client sends. It is not tied to a server-side proposal. RLS still limits it to the caller's own rows, but "only after Confirm" is a UI convention, not something the server enforces.
40. `src/components/layout/SidebarUser.tsx:27`: the role label "Owner" is hard-coded (fine today because employees never see this component, but it will be wrong if team roles are added).
41. `src/components/dashboard/UpdatesToReviewCard.tsx:50-55`: one shared mutation, so a save on one row disables every row's Approve and Keep-internal buttons, and a double-tap race between rows isn't possible to test independently.

---

## Area 02 — Pipeline / CRM / Clients

This is a code-read inventory from 2026-09-28. It was not click-tested.

**Role:** every route below is owner-only. `AppLayout.tsx:93` sends any `employee` login to `/employee` before an owner route renders, so the Role column says **Owner** unless a row is different.
**State:** the Note column is left blank for the tester. When an item only shows up in some states, the state is written in the "What it should do" column.

---

### 1. Pipeline: `/pipeline`
`src/components/views/PipelineView.tsx` (+ `src/components/marketing/LeadSourceReport.tsx`, `src/components/marketing/SpendDialogs.tsx` for the By source tab)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| PL-1 | "+ New opportunity" | Button | Opens CreateOpportunityDialog (section 13) | Owner | | |
| PL-2 | Board / By source | Segmented filter | Switches between the kanban board and the lead-source ROI report | Owner | | |
| PL-3 | Job type filter ("All types" + each Job Category) | Select | Keeps opportunities that have the picked category among their tags. Applies to the board and to By source | Owner | | |
| PL-4 | Stage columns (8 stages; Won and Lost tinted as end columns) | Droppable (desktop, `lg+`) | Each column lists its opportunities with a count. The board scrolls sideways | Owner | | |
| PL-5 | Opportunity card, drag handle (whole card) | Drag (desktop) | Dragging to another column changes the stage with an optimistic update. Dropping on **Won** runs the full Won transaction (`markOpportunityWon`). Other stages use `moveOpportunityStage`. An error rolls the card back and shows a toast | Owner | | |
| PL-6 | Opportunity card (whole card) | Link | Opens `/pipeline/:id` | Owner | | |
| PL-7 | Card contents: client, title, address, category chips (max 2), quote value, lead source, "Updated …" | Display | Value is the linked project's headline quote total. It is blank when there's no quote | Owner | | |
| PL-8 | Card quote activity badge | Display | Shows only for Proposal sent / Revisions stages when the quote status is `sent`: "Viewed" / going-cold badge | Owner | | |
| PL-9 | Card next-action strip | Display | Shows next_action and its date. Red with a warning icon when overdue | Owner | | |
| PL-10 | Card "Confirm site visit · date" flag | Display | Shows when a site visit's date passed and nobody checked it off | Owner | | |
| PL-11 | Mobile stage-grouped list (`< lg`) | List | Groups cards under stage badges with counts and hides empty stages. Cards are links only (there's no drag and no Move picker) | Owner | | |
| PL-12 | Mobile empty state | Display | "No opportunities here." when the filter matches nothing | Owner | | |
| PL-13 | By source: period select (presets + "Custom…") | Select | Sets the report's month range | Owner | | |
| PL-14 | By source: custom From / To month inputs | Input (month) | Only shown with Custom. Sets the range | Owner | | |
| PL-15 | By source: "How this is counted" info icon | Tooltip | Explains how leads, spend and revenue are attributed | Owner | | |
| PL-16 | By source: "Edit spend" (desktop) | Button | Opens the Ad spend grid dialog | Owner | | |
| PL-17 | By source: "+ Add spend" (mobile) | Button | Opens the single-entry spend form | Owner | | |
| PL-18 | By source: "Update overhead?" link | Link | Only shown when ad spend differs from Marketing overhead. Goes to `/settings/overhead` | Owner | | |
| PL-19 | By source: sortable column headers (desktop table) | Table sort | Sorts rows by the clicked column and toggles the direction | Owner | | |
| PL-20 | By source: table row / mobile source card | Row click | Opens the source detail dialog | Owner | | |
| PL-21 | Source detail dialog: lead rows | Link | Each lead opens `/pipeline/:id` and shows its stage pill and value | Owner | | |
| PL-22 | Source detail dialog: "Monthly spend" | Button | Only for paid sources. Opens the spend form locked to that source | Owner | | |
| PL-23 | Ad spend grid: cell per source × month | Input | Edits the monthly amount. An empty cell means no spend. Shows "Amounts must be numbers" when a value is invalid | Owner | | |
| PL-24 | Ad spend grid: Cancel / "Save N changes" | Buttons | Save is disabled when nothing changed or a value is invalid | Owner | | |
| PL-25 | Spend form: Lead source select | Select | Hidden when the source is fixed. Loads that source's existing value | Owner | | |
| PL-26 | Spend form: Month / Amount / Note | Inputs | Month can't be in the future. Amount accepts decimals | Owner | | |
| PL-27 | Spend form: Save / Remove | Button | Becomes "Remove" when the amount is cleared on an existing entry | Owner | | |
| PL-28 | Spend form: month history rows | Button list | Clicking a row loads that month into the form | Owner | | |
| PL-29 | Loading state | Display | "Loading…" text | Owner | | |

### 2. Opportunity detail: header and stage: `/pipeline/:id`
`src/components/views/OpportunityDetailView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| OH-1 | BackLink "Pipeline" / "Back" | Link | Goes back in app history, or to `/pipeline` when there's no history | Owner | | |
| OH-2 | Title (inline, borderless) | Input | Edit, then saves on blur. An unchanged value makes no call | Owner | | |
| OH-3 | Client name under the title | Display | Plain text, not a link | Owner | | |
| OH-4 | "Open project ↗" | Link | Only shown when a project is linked. Opens `/projects/:id` | Owner | | |
| OH-5 | "Unlink" | Text button | Only shown when a project is linked. Unlinks the project and toasts "Project unlinked" | Owner | | |
| OH-6 | "Link existing project" | Text button | Only shown when no project is linked. Opens the Link project dialog | Owner | | |
| OH-7 | Link project dialog: project rows | Button list | Links the picked project and closes the dialog. Lists this client's projects that no other opportunity has claimed | Owner | | |
| OH-8 | Link project dialog: empty states | Display | "This client has no other projects yet." / "Every project … already linked…" | Owner | | |
| OH-9 | Stage dropdown (8 stages; tinted by stage) | Select | Any stage change uses the stage-move function. **Won** runs the Won transaction, toasts "Won — project ready" and goes to `/projects/:id` | Owner | | |
| OH-10 | Loading / error states | Display | "Loading…" / "Failed to load opportunity: …" | Owner | | |

### 3. Opportunity detail: Stage banner (hidden when Lost)
`OpportunityDetailView.tsx` `StageBanner`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| SB-1 | Overdue site visit: "Yes, mark completed" | Button | Takes over from any stage message. Completes the visit, which moves the stage to Site visit done | Owner | | |
| SB-2 | Overdue site visit: "Reschedule" | Button | Opens the Edit appointment dialog for that visit | Owner | | |
| SB-3 | New lead: client phone link | Link (`tel:`) | Only shown when the client has a phone. Dials it | Owner | | |
| SB-4 | New lead: "Add contact info" | Link | Only shown when the client has no phone. Goes to `/clients/:id/edit` | Owner | | |
| SB-5 | New lead: "Mark as contacted" | Button | Moves the stage to Contacted | Owner | | |
| SB-6 | Contacted: "Schedule site visit" | Button | Opens New appointment, preset to this opportunity | Owner | | |
| SB-7 | Site visit scheduled: message only | Display | "Site visit scheduled for …". Has no button | Owner | | |
| SB-8 | Site visit done, nothing measured: "Add measurements" | Button | Opens and expands the Measurements card, scrolls to it, pulses it and focuses the first field | Owner | | |
| SB-9 | Site visit done: "Create cost plan" / "Open cost plan" | Button | Creates the project and Cost plan if needed, then goes to `/projects/:id/materials` | Owner | | |
| SB-10 | Proposal sent: "Follow up" | Button | Opens New task, preset to this opportunity | Owner | | |
| SB-11 | Proposal sent: "Client wants changes" | Button | Moves the stage to Revisions | Owner | | |
| SB-12 | Revisions: "Open project view" | Button | Gets or creates the project, then goes to it | Owner | | |
| SB-13 | Won: "Go to project" | Button | Gets or creates the project, then goes to it | Owner | | |
| SB-14 | Buttons disabled while pending | State | Labels change to "Saving…" / "Opening…" | Owner | | |

### 4. Opportunity detail: Details card
`OpportunityDetailView.tsx` Details section, `MeasuredCategoryMultiSelect.tsx`, `FeatureTypeChips.tsx`, `LeadSourceSelect.tsx`, `planned-actual/JobContextChips.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| OD-1 | Property address | Input | Saves on blur | Owner | | |
| OD-2 | "Use client's address: …" | Text button | Only shown when the address is empty and the client has one. Fills the address in with one click | Owner | | |
| OD-3 | Features chips (each chip) | Button | Opens the feature picker (a popover on desktop, a bottom sheet on mobile) | Owner | | |
| OD-4 | Features "Add features…" placeholder | Button | Shown when nothing is selected. Opens the picker | Owner | | |
| OD-5 | Features Edit (pencil) icon | Icon button | Opens the picker | Owner | | |
| OD-6 | Features "+N more" / "Show less" | Button | Expands or collapses chips past 3 rows | Owner | | |
| OD-7 | Feature picker items (catch-all categories hidden) | Command list (toggle) | Toggles a type. With no project it saves to the opportunity's categories. Once there's a project it saves to the project's features | Owner | | |
| OD-8 | "Remove {type}?" confirm | AlertDialog | Only asked when a removed type still has saved measurements. "Keep it" / "Remove type" (hides the card, keeps the data) | Owner | | |
| OD-9 | Lead source | Select | Lists the Settings lead sources plus "Select a source" (none). A legacy value is kept as an extra option. Saves immediately | Owner | | |
| OD-10 | Lead source "add some in Settings" | Link | Only shown when there are no lead sources. Goes to `/settings/lead-sources` | Owner | | |
| OD-11 | Description of requested work | Textarea | Saves on blur | Owner | | |
| OD-12 | Site condition notes | Auto-grow textarea | Saves on blur. Internal only | Owner | | |
| OD-13 | Job context: Slope (Flat/Slight/Moderate/Steep) | Toggle chips | Only shown once a project exists. Tap to set, tap again to clear. Optimistic save to the project | Owner | | |
| OD-14 | Job context: Access (Easy/Tight/Difficult) | Toggle chips | Same as OD-13. Hints show as tooltips | Owner | | |
| OD-15 | Job context: Soil / excavation (Normal/Clay/Rocky/Wet) | Toggle chips | Same as OD-13 | Owner | | |
| OD-16 | Job context: Demo / removal (None/Light/Heavy) | Toggle chips | Same as OD-13 | Owner | | |
| OD-17 | "Add it to Site condition notes" | Text button | Scrolls to the notes box and focuses it | Owner | | |
| OD-18 | Lost reason | Textarea | Only shown when the stage is Lost. Saves on blur | Owner | | |

### 5. Opportunity / Project: Measurements card
`src/components/common/ProjectMeasurementsCard.tsx`, `src/components/measurements/{FeatureCard,editors,fields,diagrams}.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| MC-1 | "Measurements" header (whole row) | Collapse toggle | Collapses or expands the card. Collapsed, it shows "N features · N measured · N empty". State is saved in localStorage per user | Owner | | |
| MC-2 | Hint text | Display | "Fill this out once the site visit is completed." | Owner | | |
| MC-3 | No-type hint | Display | "Pick a project type to get its measurement card." | Owner | | |
| MC-4 | Collapse all / Expand all | Text buttons | Only shown with more than one feature card. Toggles every feature card | Owner | | |
| MC-5 | Feature card header (whole row) | Collapse toggle | Collapsed, it shows the summary or "Not measured yet". Expanded, it shows the roll-up total ("Total …" when there are several) | Owner | | |
| MC-6 | Instance label | Input | Optional label (e.g. "Back patio"). With several instances the placeholder reads "{Noun} N — label" | Owner | | |
| MC-7 | Instance trash (Remove / Clear) | Icon button | Shown when there are several instances, or the only one has data. Removes it from the draft | Owner | | |
| MC-8 | "+ Add another {noun}" | Button | Adds a second or later instance, which becomes a new project feature when saved | Owner | | |
| MC-9 | Per-instance headline | Display | Only shown with several instances. That instance's total | Owner | | |
| MC-10 | "Add custom measurement" | Text button | Adds a custom label/qty/unit row | Owner | | |
| MC-11 | Custom row: Label | Input | Free text | Owner | | |
| MC-12 | Custom row: Qty | Numeric input | Decimal input. Invalid or negative input becomes empty | Owner | | |
| MC-13 | Custom row: Unit (sq ft / linear ft / ft / in / count / cu yd) | Select | Sets the unit. Rows are "for reference, not in totals" | Owner | | |
| MC-14 | Custom row: remove (×) | Icon button | Removes the row | Owner | | |
| MC-15 | Custom-only group (no purpose-built editor / General) | Row | Shows an empty row that the first edit creates | Owner | | |
| MC-16 | DraftSaveBar: "Discard" | Button (sticky) | Shown while there are unsaved edits. Goes back to the saved values | Owner | | |
| MC-17 | DraftSaveBar: "Save changes" | Button (sticky) | Creates the project if missing, syncs features, saves instances and custom rows, and toasts "Measurements saved" | Owner | | |
| MC-18 | Leave-page guard | Prompt | Navigating away while there are unsaved edits asks to save or discard | Owner | | |
| MC-19 | Footnote | Display | "Patio, walkway and driveway sq ft add up to the job size…" | Owner | | |
| **Field widgets** | | | | | | |
| MC-20 | ft + in pair (every "ft" field) | 2 numeric inputs | Stored as decimal feet. The ft box also takes decimal feet. Resyncs on Discard | Owner | | |
| MC-21 | Single number field (in, sq ft, qty) | Numeric input | Decimal keypad. The unit shows as a suffix | Owner | | |
| MC-22 | Diagram edge badges (A–F, L, W, D) | SVG click target | Focuses and selects the matching input. Shows the current value | Owner | | |
| MC-23 | Segmented choice pills | Radio group | Picks one option (method, shape, layout, sides) | Owner | | |
| MC-24 | Computed result line | Display (aria-live) | Shows the live math, e.g. "20 ft × 12 ft = 240 sq ft" | Owner | | |
| MC-25 | Warning line | Display | Explains why an L or U shape can't be valid | Owner | | |
| **Paver patio / Walkway / Driveway (AreaBuilder)** | | | | | | |
| MC-26 | Measure by: Dimensions / Total sq ft | Segmented | Switches the input method | Owner | | |
| MC-27 | Total area (sq ft) | Numeric | Only with the Total method | Owner | | |
| MC-28 | Shape: Straight / L-shape / [U-shape] / Irregular | Segmented | The shape list depends on the feature. U-shape is offered for patio and walkway | Owner | | |
| MC-29 | Rectangle: Length, Width (ft+in) + diagram | Inputs | Walkway draws as a tall strip | Owner | | |
| MC-30 | L-shape: A, B, C, D (ft+in) + diagram | Inputs | Patio: A full bottom, B full left, C top, D right. Flatwork: two legs plus their widths. Warns when C > A or D > B | Owner | | |
| MC-31 | U-shape (walkway): A top leg, B side leg, C bottom leg, Walkway width | Inputs | Warns when a leg is shorter than the width | Owner | | |
| MC-32 | U-shape (walkway): "Flip" | Button | Mirrors the diagram left or right | Owner | | |
| MC-33 | U-shape (patio): A–F + diagram | Inputs | Warns when C + E > A or F > B/D | Owner | | |
| MC-34 | Irregular: area label / Length / Width per sub-area | Inputs | Rectangles are added together | Owner | | |
| MC-35 | Irregular: remove area (×) | Icon button | Shown when there's more than one area | Owner | | |
| MC-36 | Irregular: "Add area" | Text button | Adds a sub-rectangle | Owner | | |
| MC-37 | Irregular: "Know the total? Enter sq ft" | Text button | Switches the method to Total | Owner | | |
| **Outdoor kitchen** | | | | | | |
| MC-38 | Layout: Straight / L-shape / U-shape / Custom | Segmented | Sets the run count and diagram | Owner | | |
| MC-39 | Run A/B/C length (ft+in) | Inputs | Shows a LF total. Runs past the layout are kept but not counted, with a note | Owner | | |
| MC-40 | Custom layout: remove run (×) / "Add run" | Buttons | Only with the Custom layout | Owner | | |
| MC-41 | Counter height "… in · change" / input / "Use default" | Defaultable field | Uses the contractor default until changed. "Use default" clears the override | Owner | | |
| MC-42 | Backsplash | Switch (toggle) | Shows the Length (ft+in, blank = whole counter) and Height (in) fields, plus the sq ft result | Owner | | |
| **Seating wall** | | | | | | |
| MC-43 | Height (in) | Numeric | Wall height | Owner | | |
| MC-44 | Layout: Straight / L / U / Curved / Custom + runs | Segmented + inputs | Curved has a single "Length along the curve" | Owner | | |
| MC-45 | Backrest | Switch (toggle) | Shows Length (ft+in, blank = whole wall) and Height above seat (in), plus the LF result | Owner | | |
| **Retaining wall** | | | | | | |
| MC-46 | Measure by: LF × Height / Wall sq ft | Segmented | Switches the method | Owner | | |
| MC-47 | Average height (ft+in) + run builder | Inputs | Shows "N LF × H ft = X wall sq ft" | Owner | | |
| MC-48 | Wall face area (sq ft) | Numeric | Only with the Wall sq ft method | Owner | | |
| **Fire pit** | | | | | | |
| MC-49 | Shape: Round / Square-Rect / Custom | Segmented | Switches the fields | Owner | | |
| MC-50 | Round: D diameter (ft+in) + circle diagram | Input | Shows LF around and footprint | Owner | | |
| MC-51 | Rect: Length, Width (ft+in) | Inputs | Shows perimeter and footprint | Owner | | |
| MC-52 | Custom: description / approx sq ft | Textarea + numeric | Shows an approximate footprint | Owner | | |
| MC-53 | Height (defaultable, in) | Defaultable field | Same as MC-41 | Owner | | |
| **Fireplace** | | | | | | |
| MC-54 | Width, Depth, Overall height (ft+in) + diagram | Inputs | Shows footprint and veneer sq ft | Owner | | |
| MC-55 | Freestanding (4 sides) / Against a wall (3 sides) | Segmented | Changes the veneer run | Owner | | |
| **Outdoor lighting** | | | | | | |
| MC-56 | Fixture type (Path / Uplight / Hardscape-ledge / Step / Strip / Other) | Select | Switching between count and length types clears qty | Owner | | |
| MC-57 | Qty (count types) | Numeric | Fixture count | Owner | | |
| MC-58 | Length (strip lighting, ft+in) | Input | Strip LF | Owner | | |
| MC-59 | Fixture name (Other) | Input | Free text | Owner | | |
| MC-60 | Remove fixture row (×) / "Add fixture type" | Buttons | Remove is shown when there's more than one row | Owner | | |
| **Steps** | | | | | | |
| MC-61 | Step section label / Number of steps / Width (ft+in) | Inputs | Shows total steps and LF of tread | Owner | | |
| MC-62 | Remove step section (×) / "Add step section" | Buttons | Remove is shown when there's more than one section | Owner | | |

### 6. Opportunity detail: Site photos
`OpportunityDetailView.tsx` `OpportunityPhotosSection` / `FirstPhotoUploader`, `src/components/common/PhotoGallery.tsx` (`internalOnly`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| PH-1 | First-photo tile (before a project exists) | Button + file input | Takes a single image (camera capture), creates the project lazily, then uploads | Owner | | |
| PH-2 | "Add photos" tile (once a project exists) | Button + file input | Takes several images (camera capture) | Owner | | |
| PH-3 | Photo tile | Button | Opens the photo dialog | Owner | | |
| PH-4 | Photo dialog: Caption | Input | Saves on blur or when the dialog closes | Owner | | |
| PH-5 | Photo dialog: "Delete photo" | Button | Deletes the photo. There's no confirm | Owner | | |
| PH-6 | Client-photo review strip: Accept (✓) / Reject (trash) | Icon buttons | Only for photos a client uploaded that are pending | Owner | | |
| PH-7 | Empty / loading | Display | "No photos yet." / "Loading…" | Owner | | |

### 7. Opportunity detail: Estimate card
`OpportunityDetailView.tsx` `EstimateCard`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| ES-1 | Cost plan row (name + cost badge) | Link | Opens `/projects/:id/materials` | Owner | | |
| ES-2 | Quote row (total, Add-on #, status pill) | Link | Opens `/quotes/:id` | Owner | | |
| ES-3 | "Create cost plan" / "Open cost plan" | Button | This is the main button when no cost plan exists. Creates the project and plan, then opens it | Owner | | |
| ES-4 | "Create quote" / "Open quote" | Button | This is the main button once a cost plan exists. Opens the headline quote, or creates one (optionally with a section per feature) | Owner | | |
| ES-5 | "Start the quote with a section per project type (…)" | Checkbox | Only shown when types are selected and there's no quote yet. On by default | Owner | | |
| ES-6 | Quote activity line | Button → dialog | Only shown for a non-draft headline quote. Opens the quote activity dialog | Owner | | |
| ES-7 | Notices | Display | "No cost plan or quote yet." / "No cost plan — margin won't be visible." / "Won manually — no signed quote on file." | Owner | | |

### 8. Opportunity detail: Appointments, Tasks, Activity cards
`OpportunityDetailView.tsx` (reuses `AppointmentRow`, `CreateAppointmentDialog`, `TaskRow`, `CreateTaskDialog`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| OA-1 | Appointments "+ Add" | Text button | Opens New appointment with the client and opportunity preset (no client picker) | Owner | | |
| OA-2 | Appointment rows (scheduled first, then completed) | Row | See section 10 for the row controls. The estimate button here reads "Start estimate →" / "Open cost plan →" and opens or creates the Cost plan | Owner | | |
| OA-3 | Tasks "+ Add" | Text button | Opens New task with the client and opportunity preset | Owner | | |
| OA-4 | Task rows: completion checkbox | Checkbox | Toggles completion. Completed tasks stay, struck through, at the bottom | Owner | | |
| OA-5 | Task row client name | Link | Opens `/clients/:id` | Owner | | |
| OA-6 | Activity: "Log an update…" | Input (Enter submits) | Logs a note for this opportunity and refreshes the opportunity | Owner | | |
| OA-7 | Activity: "Log activity" | Button | Same as OA-6. Disabled when empty or pending | Owner | | |
| OA-8 | Activity: "See more (N)" / "See less" | Text button | Shown when there are more than 3 entries | Owner | | |
| OA-9 | Empty states | Display | "No appointments yet." / "No tasks yet." / "No activity yet." | Owner | | |

### 9. Tasks: `/tasks`
`src/components/views/TasksView.tsx`, `src/components/common/FromDateControl.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| TK-1 | "+ New task" | Button | Opens New task | Owner | | |
| TK-2 | Upcoming / Overdue / Completed / All (with counts) | FilterSegment (desktop) / FilterPills (mobile) | Filters the list | Owner | | |
| TK-3 | From: Today / Tomorrow / Next week | Preset pills | Only on the Upcoming filter. Sets the start date | Owner | | |
| TK-4 | From date | Input (date) | Only on Upcoming. A custom start date. Clearing it is ignored | Owner | | |
| TK-5 | Upcoming day-group headings | Display | Tasks due from the chosen date are grouped by day. Undated tasks show only when the start date is today | Owner | | |
| TK-6 | Task row checkbox | Checkbox | Toggles completion | Owner | | |
| TK-7 | Task row client name | Link | Opens `/clients/:id` | Owner | | |
| TK-8 | Row meta: type, due date, "High priority", "Overdue" badge | Display | Shows the task's details | Owner | | |
| TK-9 | Empty / loading | Display | "Nothing due from … on." / "Nothing here." / "Loading…" | Owner | | |
| TK-10 | New task dialog: Task title | Input | Required | Owner | | |
| TK-11 | New task dialog: Type | Select | The creatable task types | Owner | | |
| TK-12 | New task dialog: Due date | Input (date) | Optional | Owner | | |
| TK-13 | New task dialog: Priority (Low/Normal/High) | Select | Defaults to Normal | Owner | | |
| TK-14 | New task dialog: Customer (optional) | ClientCombobox | Hidden when the client is preset. See section 14 | Owner | | |
| TK-15 | New task dialog: "Create task" | Button | Disabled until there's a title or while a new-client draft is invalid. Creates the client if needed, then the task | Owner | | |

### 10. Appointments: `/appointments`
`src/components/views/AppointmentsView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| AP-1 | "+ New appointment" | Button | Opens New appointment | Owner | | |
| AP-2 | Upcoming / Past / All (with counts) | FilterSegment / FilterPills | Upcoming = scheduled from the chosen date. Past = past dates, plus anything not scheduled | Owner | | |
| AP-3 | From: Today / Tomorrow / Next week / date | Preset pills + date | Only on Upcoming | Owner | | |
| AP-4 | Upcoming day-group headings | Display | Grouped by local date | Owner | | |
| AP-5 | Row completion checkbox | Checkbox | Only for scheduled or completed rows. Checking it completes the appointment (logs activity and, for a site visit, moves the stage forward). Unchecking sets it back to scheduled. The border is red when overdue | Owner | | |
| AP-6 | Row meta: type, status pill, weather chip, date · time, client, address, outcome | Display | Shows the appointment's details | Owner | | |
| AP-7 | Weather forecast chip | Popover | Opens the day's weather and risk | Owner | | |
| AP-8 | "Edit" (scheduled or completed) | Button | Opens Edit appointment | Owner | | |
| AP-9 | "Cancel" (scheduled) | Button | Sets the status to cancelled right away. There's no confirm | Owner | | |
| AP-10 | "Start estimate →" (completed site visit) | Button | Here and on the client page, creates a new **standalone quote** and opens it. On the opportunity page, opens the Cost plan (OA-2) | Owner | | |
| AP-11 | New appointment dialog: Type | Select | Every appointment type. Defaults to Site visit | Owner | | |
| AP-12 | New appointment dialog: Date | Input (date) | Defaults to today, or tomorrow near midnight | Owner | | |
| AP-13 | New appointment dialog: Time | Input (time, 15-min step) | Defaults to the next half hour. Clearing it makes the appointment date-only | Owner | | |
| AP-14 | New appointment dialog: Notes | Textarea | Optional | Owner | | |
| AP-15 | New appointment dialog: Customer | ClientCombobox (required) | Hidden when the client is preset | Owner | | |
| AP-16 | New appointment dialog: "Create appointment" | Button | Needs a client and a date. The address fills in automatically (opportunity address, then client address) | Owner | | |
| AP-17 | Edit dialog: Type / Date / Time / Notes | Inputs | Same fields as New. The address can't be edited | Owner | | |
| AP-18 | Edit dialog: "Save changes" | Button | Disabled without a date | Owner | | |
| AP-19 | Empty / loading | Display | "No appointments from … on." / "Nothing here." | Owner | | |

### 11. Communications: `/communications`
`src/components/views/CommunicationsView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CM-1 | "Pick a customer" | Button → ClientPickerDialog | Opens the picker. The button then shows the chosen name | Owner | | |
| CM-2 | Picker dialog: search / pick / "+ New client" / "Add client" / Cancel | ClientCombobox in a modal | Picking an existing client applies right away. A new client is created by "Add client" | Owner | | |
| CM-3 | Kind: Text / Email / Note | Select | Defaults to Note | Owner | | |
| CM-4 | "What happened?" | Input (Enter submits) | The log body | Owner | | |
| CM-5 | "Log" | Button | Needs a client and a body | Owner | | |
| CM-6 | All / Texts / Emails / Notes (with counts) | FilterSegment / FilterPills | Filters the feed | Owner | | |
| CM-7 | Communication row (whole row) | Link | Opens `/clients/:id` | Owner | | |
| CM-8 | Empty / loading | Display | "Nothing here." / "Loading…" | Owner | | |

### 12. Clients: `/clients`, `/clients/new`, `/clients/:clientId`, `/clients/:clientId/edit`
`src/components/views/ClientsView.tsx`, `ClientFormView.tsx`, `ClientDetailView.tsx`

#### 12a. Clients list: `/clients`
| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CL-1 | "+ Add client" (desktop) / "+ Add" (mobile header) | Button | Goes to `/clients/new` | Owner | | |
| CL-2 | Search "name, email, address" (desktop + mobile header) | SearchInput | Filters by name, email or address | Owner | | |
| CL-3 | All / Active / Repeat / Leads (with counts) | FilterSegment / FilterPills | Filters by the derived kind (from projects) | Owner | | |
| CL-4 | Client card (desktop, whole card, Enter/Space) | Card click | Opens `/clients/:id` | Owner | | |
| CL-5 | Card ⋯ menu | DropdownMenu | Opens the menu without navigating | Owner | | |
| CL-6 | ⋯ → Edit | Menu item | Goes to `/clients/:id/edit` | Owner | | |
| CL-7 | ⋯ → Delete | Menu item | Deletes the client right away. There's no confirm. Shows a toast on error | Owner | | |
| CL-8 | Mobile ListCard (whole card) | Card click | Opens `/clients/:id`. Mobile has no Edit or Delete | Owner | | |
| CL-9 | Card data: initials, project count, kind, email, phone, address, lifetime revenue | Display | Shows the client's details | Owner | | |
| CL-10 | Loading / error / empty | Display | "Loading clients…" / "Failed to load clients" / "No clients here." | Owner | | |

#### 12b. New / Edit client: `/clients/new`, `/clients/:clientId/edit`
| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CF-1 | BackLink "Clients" | Link | Goes back, or to `/clients` | Owner | | |
| CF-2 | Client name | Input | Required. Autofocused on New | Owner | | |
| CF-3 | Email | Input (email) | Optional | Owner | | |
| CF-4 | Phone | Input | Optional | Owner | | |
| CF-5 | Address | Input | Optional | Owner | | |
| CF-6 | Status (Lead/Active/Past/Inactive) | Select | **Edit only** | Owner | | |
| CF-7 | Lead source | Input (free text) | Optional | Owner | | |
| CF-8 | Preferred contact method (No preference/Phone/Email/Text) | Select | Optional | Owner | | |
| CF-9 | Cancel | Button | Goes to `/clients` | Owner | | |
| CF-10 | "Create client" / "Save changes" | Button | Needs a name. Saves, then goes to `/clients` | Owner | | |
| CF-11 | Loading / error (edit) | Display | "Loading client…" / "Couldn't load that client." | Owner | | |

#### 12c. Client detail: `/clients/:clientId`
| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CD-1 | BackLink "Clients" (desktop) / header back (mobile) | Link | Goes back, or to `/clients` | Owner | | |
| CD-2 | "Edit" | Button | **Desktop only**. Goes to `/clients/:id/edit` | Owner | | |
| CD-3 | Status pill, contact line | Display | Shows the client's status and contact info | Owner | | |
| CD-4 | Tag chip × | Icon button | Removes the tag | Owner | | |
| CD-5 | "+ Add tag" | Input (Enter or blur adds) | Adds a tag. Duplicates and blanks are ignored | Owner | | |
| CD-6 | Opportunities list rows | Link | Opens `/pipeline/:id` with a stage pill | Owner | | |
| CD-7 | Projects list rows | Link | Opens `/projects/:id` | Owner | | |
| CD-8 | Quotes list rows (total + status) | Link | Opens `/quotes/:id` | Owner | | |
| CD-9 | Invoices list rows (number or amount + status) | Link | Opens `/invoices/:id` | Owner | | |
| CD-10 | Files & photos: tile | Display | Shows the image. It isn't clickable (no lightbox) | Owner | | |
| CD-11 | Files & photos: delete (trash, hover) | Icon button | Deletes the file and its storage object. There's no confirm | Owner | | |
| CD-12 | Files & photos: "Add files" | Button + file input | Uploads several images | Owner | | |
| CD-13 | Activity: Kind (Note/Text/Email/Other) | Select | The kind of entry to log | Owner | | |
| CD-14 | Activity: "Log a note, text, or email…" | Input (Enter submits) | The entry body | Owner | | |
| CD-15 | Activity: "Log activity" | Button | Logs the entry. The feed also shows automatic quote events | Owner | | |
| CD-16 | Appointments "+ Add" | Text button | Opens New appointment with the client preset | Owner | | |
| CD-17 | Appointment rows | Row | Same controls as AP-5 to AP-10 (Start estimate creates a standalone quote) | Owner | | |
| CD-18 | Tasks "+ Add" | Text button | Opens New task with the client preset | Owner | | |
| CD-19 | Task rows (open only) | Checkbox + link | Completing a task removes it from this card | Owner | | |
| CD-20 | Money: Lifetime revenue / Outstanding balance | Display | Revenue comes from payments. Balance comes from invoices | Owner | | |
| CD-21 | Contact card | Display | Email / phone / address / source (plain text, not tel/mailto links) | Owner | | |
| CD-22 | Client hub: "Invite" / "Resend link" | Button | Disabled without an email. Sends the magic link, stamps the invite time, and toasts | Owner | | |
| CD-23 | Client hub status | Display | Active / Invited / Never signed in, with a timestamp | Owner | | |
| CD-24 | "Don't ask for reviews" | Switch | Turns off review prompts and the Hub review card for this client | Owner | | |
| CD-25 | Contacts "+ Add" | Text button (toggle) | Shows or hides the add form | Owner | | |
| CD-26 | Contact form: Name / Role / Phone / Email / "Add contact" | Inputs + Button | Name is required | Owner | | |
| CD-27 | Contact remove (trash) | Icon button | Deletes the contact. There's no confirm | Owner | | |
| CD-28 | Property addresses "+ Add" | Text button (toggle) | Shows or hides the add form | Owner | | |
| CD-29 | Address form: Label / Address / "Add address" | Inputs + Button | Address is required | Owner | | |
| CD-30 | Address remove (trash) | Icon button | Deletes the address. There's no confirm | Owner | | |
| CD-31 | Internal notes | Textarea | Saves on blur | Owner | | |
| CD-32 | Loading / error | Display | "Loading client…" / "Failed to load client: …" | Owner | | |

### 13. Create opportunity dialog
`src/components/common/CreateOpportunityDialog.tsx` (opened from `/pipeline` and the Dashboard CTA)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CO-1 | Client | ClientCombobox (required, autofocus) | See section 14 | Owner | | |
| CO-2 | Title | Input | Required | Owner | | |
| CO-3 | Job site address | Input | Filled in from the picked or new client's address until the user types in it. The helper text changes to match | Owner | | |
| CO-4 | Project types | CategoryMultiSelect (popover, checkbox list) | Optional. Every category, including catch-alls | Owner | | |
| CO-5 | Lead source | LeadSourceSelect | Optional | Owner | | |
| CO-6 | Cancel | Button | Closes the dialog and resets the form | Owner | | |
| CO-7 | "Create opportunity" | Button | Needs a client and a title. Creates the client if needed, then the opportunity and its categories, then goes to `/pipeline/:id` | Owner | | |
| CO-8 | Mobile layout | Full-height sheet | The header and footer stay fixed while the body scrolls. Accounts for the safe area | Owner | | |

### 14. Client combobox (shared picker)
`src/components/common/ClientPicker.tsx`, `src/hooks/use-client-field.ts`. Used by: CreateOpportunityDialog, CreateTaskDialog, CreateAppointmentDialog, ClientPickerDialog (Communications, quote builder), NewProjectView

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CC-1 | "Search name, email or phone…" | Combobox input | Filters as you type. Phone matching is digits-only with at least 3 digits | Owner | | |
| CC-2 | Results list (sorted A–Z) | Listbox | Pick with a mouse press or with ↑/↓ + Enter. Esc closes only the list | Owner | | |
| CC-3 | "No client" row | Option | Only in optional mode with no query | Owner | | |
| CC-4 | "+ New client" (list) / `Add "…" as new client` (no match) | Option | Opens the inline new-client form, prefilled with the typed name | Owner | | |
| CC-5 | "+ New client" (beside the label) | Text button | Opens the inline form | Owner | | |
| CC-6 | Selected-client chip × ("Clear client") | Icon button | Clears the pick and refocuses search | Owner | | |
| CC-7 | New client form: Name / Phone / Email / Address | Inputs | Needs a name plus a phone or email. Checks the email format. The reason shows live | Owner | | |
| CC-8 | New client form: Cancel | Text button | Drops the draft | Owner | | |
| CC-9 | Duplicate prompt: "Use existing" | Button | Swaps in the existing client with the same phone or email | Owner | | |
| CC-10 | Duplicate prompt: "Create anyway" | Button | Creates the new client anyway and submits again | Owner | | |
| CC-11 | Inline create error | Display | "Couldn't create the client: …" | Owner | | |
| CC-12 | Mobile: focus scrolls the field to the top | Behavior | Keeps the results above the keyboard | Owner | | |

---

### Code observations (unverified)

None of these have been checked in the running app. They come from reading the code only.

#### Likely bugs / dead ends
- **(unverified)** `src/components/measurements/editors.tsx:561-565` (with `diagrams.tsx:91-92`): the fireplace diagram draws `RectDiagram length={width_ft} width={depth_ft}`, but its inputs have ids `-w`/`-d`/`-h`. So the **L** badge (which shows the width) focuses nothing, and the **W** badge (which shows the depth) focuses the Width input.
- **(unverified)** `src/components/views/AppointmentsView.tsx:188-191`: outside the opportunity page, "Start estimate →" on a completed site visit calls `createQuote({client_id})`. That makes a **new standalone quote on every click**, not linked to the opportunity or project. This is a duplicate-record risk, and the same label does something different on the opportunity page (opens the Cost plan).
- **(unverified)** `src/components/views/AppointmentsView.tsx:62-67`: the doc comment promises "completing a site visit prompts for outcome notes". There's no outcome prompt anywhere. The checkbox completes the visit directly, and `outcome` can't be edited (the Edit dialog only edits `notes`).
- **(unverified)** `src/components/views/PipelineView.tsx:40-44 vs 206-233`: the header comment says mobile gets a "Move" picker per card. The mobile list is plain links, so on a phone the stage can only be changed from the detail page.
- **(unverified)** `src/components/views/PipelineView.tsx:318,360-372`: the card shows `next_action` / `next_action_date`. `api.ts:5659-5662` says those fields are gone and the next step now comes from the soonest open task. Old stale values will still render, and nothing writes new ones.
- **(unverified)** `src/components/views/PipelineView.tsx:35`: `today()` uses `toISOString().slice(0,10)` (UTC). In the US evening, next actions due today show as overdue. This is the same UTC bug Tasks and Appointments already fixed with `localYmd`.
- **(unverified)** `src/components/views/OpportunityDetailView.tsx:363-373`: clearing the title commits `null`, but `opportunities.title` is `NOT NULL` (`0049_opportunities.sql:12`). The result is a DB error toast and a blank title field left in the draft.
- **(unverified)** `src/components/common/CreateOpportunityDialog.tsx:68-75`: `createOpportunity` runs, then `setOpportunityCategories` runs separately. If the second call fails, the opportunity already exists but the dialog shows an error. Clicking Create again makes a **duplicate opportunity**.
- **(unverified)** `src/components/views/ClientFormView.tsx:103`: creating a client drops `preferred_contact_method` (`createClient` at `api.ts:1297` doesn't accept it), so the field on `/clients/new` does nothing.
- **(unverified)** `src/components/views/ClientFormView.tsx:103`: `/clients/new` has **no duplicate check**, while ClientCombobox checks for the same phone or email (`use-client-field.ts:80-86`). The full-page form can create duplicate clients.
- **(unverified)** `src/components/views/ClientDetailView.tsx:142-151`: `addTag` builds from `client.tags` before the refetch. Adding two tags quickly (Enter, then blur) can overwrite the first.
- **(unverified)** `src/components/views/ClientFormView.tsx:109`: saving always goes to `/clients`. So "Add contact info" from an opportunity's New lead banner (`OpportunityDetailView.tsx:757`) doesn't bring the user back to the opportunity or the client.
- **(unverified)** No UI calls `deleteOpportunity` (`api.ts:5700`), `updateTask` / `deleteTask` (`api.ts:6016,6047`) or `deleteAppointment` (`api.ts:6268`). Opportunities, tasks and appointments can't be deleted, and tasks can't be edited once created.
- **(unverified)** `src/components/views/CommunicationsView.tsx:89`: a row with no `client_id` links to `"#"`, which is a dead link.
- **(unverified)** `src/components/views/OpportunityDetailView.tsx:684-688`: the StageBanner comment says it's hidden for Won and Lost, but the code (`:445`, `:799`) shows a Won banner. The comment and the code disagree.

#### Measurement math / units
- **(unverified)** `src/lib/feetInches.ts:3-8`: `parseMeasure` quietly turns negative or non-numeric text (e.g. `12'6"`, `12 6`, `-3`) into `null`. The value disappears with no warning.
- **(unverified)** `src/lib/feetInches.ts:24-29`: an inches box value of 12 or more (e.g. 18) is accepted without checks and adds 1.5 ft. Decimal feet in the ft box plus inches (12.5 ft + 6 in = 13 ft) is also accepted, which risks double-counting.
- **(unverified)** `src/lib/measurements.ts:697` (`fmt`, 1 decimal): the diagrams and computed lines show decimal feet (10′4″ shows as "10.3′" / "10.3 ft") even though entry is ft+in. The display is inconsistent and rounded.
- **(unverified)** `src/components/measurements/editors.tsx:420,469,565`: heights use different units from feature to feature. Seating wall, kitchen counter and fire pit are in **inches**. Retaining wall average height and fireplace overall height are in **ft+in**. Field testers are likely to mix them up.
- **(unverified)** `src/components/measurements/editors.tsx:622,667`: fixture Qty and "Number of steps" use the decimal keypad and accept fractions (e.g. 2.5 steps).
- **(unverified)** `src/lib/measurements.ts:592,602`: turning Backsplash on with a blank height gives 0 sq ft, with no hint. Seating wall height has no default (0 when blank), unlike kitchen and fire pit.
- **(unverified)** `src/lib/measurements.ts:743`: `instanceHasData` treats `0` as empty. An instance where the user typed only zeros is dropped on Save, and its stored row is deleted.
- **(unverified)** `src/components/measurements/FeatureCard.tsx:219-226`: a custom row with unit **ft** uses a plain decimal `NumField` (no suffix), not the ft+in pair used everywhere else.
- **(unverified)** `src/components/measurements/editors.tsx:333-334`: runs carry a `label` that is shown in the run name, but no input edits it.
- **(unverified)** `src/components/common/ProjectMeasurementsCard.tsx:261-306`: Save is several steps with no transaction (create/update/remove features, then `saveProjectMeasurements`, then `ensureFeatureSections`). A failure partway through leaves features and measurements out of sync.

#### Loading / empty / error states
- **(unverified)** `src/components/views/PipelineView.tsx:189-204`: the desktop board has no empty state and no error state. A failed `listOpportunities` just shows empty columns. The same applies to Tasks, Appointments and Communications (`isError` is never read).
- **(unverified)** `src/components/views/OpportunityDetailView.tsx:1022-1029`: SheetCostBadge shows `$0` while loading and on error.

#### Mobile risks
- **(unverified)** `src/components/views/ClientDetailView.tsx:164-169`: MobilePageHeader has no actions, so the client **Edit button is desktop-only** (`:171 hidden md:block`). Client delete is desktop-only too (`ClientsView.tsx:179`).
- **(unverified)** `src/components/views/ClientDetailView.tsx:628`: the file delete button is `opacity-0 group-hover:opacity-100`, which is invisible on touch.
- **(unverified)** Tap targets under 44px:
  - Appointment Edit and Cancel `h-7` (`AppointmentsView.tsx:235,239,253,258`)
  - PhotoGallery accept/reject `h-6` (`PhotoGallery.tsx:227-243`)
  - FeatureTypeChips chips and Edit `h-7` (`FeatureTypeChips.tsx:14,124`)
  - JobContextChips `min-h-[32px]` (`JobContextChips.tsx:57`)
  - tag remove × 12px, and contact/address trash 14px icons with no padding (`ClientDetailView.tsx:197,482,552`)
  - ClientCombobox clear `h-7` (`ClientPicker.tsx:182`)
  - Clients mobile "+ Add" `h-8` (`ClientsView.tsx:112`)
  - "+ Add" text links on cards
  - diagram badges ~18px tall and `tabIndex=-1` (`diagrams.tsx:26-38`)
- **(unverified)** `src/components/views/OpportunityDetailView.tsx:1195-1200` and `PhotoGallery.tsx:321-323`: `capture="environment"` makes some Android browsers open the camera only, with no way to pick from the gallery. The first-photo uploader also takes only one file.
- **(unverified)** `src/components/views/PipelineView.tsx:189,207`: the board appears only from `lg`, so tablets and small laptops (768–1023px) get the phone list with no way to change stage.
- **(unverified)** `src/components/common/DraftSaveBar.tsx:55`: the bar is fixed at `bottom-[68px]`, which assumes the tab bar is 68px tall. It relies on `--draft-bar-h` padding, so check that the opportunity page's last cards (Activity) aren't covered on phones.

#### Duplicate-record risks
- **(unverified)** AP-10 standalone quote per click (`AppointmentsView.tsx:189`). CreateOpportunityDialog retry (`CreateOpportunityDialog.tsx:68-75`). `/clients/new` has no duplicate check (`ClientFormView.tsx:103`).
- **(unverified)** Enter-to-submit has no `isPending` guard, so a fast double Enter logs the entry twice: `OpportunityDetailView.tsx:1259`, `ClientDetailView.tsx:703`, `CommunicationsView.tsx:156`.

#### Destructive actions without confirm
- **(unverified)** Nothing asks for confirmation:
  - client delete (`ClientsView.tsx:194`), which may cascade or fail on FKs, with only a toast
  - opportunity Unlink project (`OpportunityDetailView.tsx:411`)
  - appointment Cancel (`AppointmentsView.tsx:244`)
  - file, contact and address deletes (`ClientDetailView.tsx:482,552,626`)
  - Photo delete (`PhotoGallery.tsx:395`)
- **(unverified)** `OpportunityDetailView.tsx:430`, `PipelineView.tsx:142`: moving to **Won** (from the dropdown or a drag) runs the full Won transaction (quote lock, sibling quotes marked not-selected, deposit invoice drafted) with **no confirm**. Moving out of Won, or to Lost, doesn't ask for a lost reason either. The reason field only appears after the move.

#### Data consistency / naming
- **(unverified)** `ClientsView.tsx:71-74` vs `ClientDetailView.tsx:139`: "Lifetime revenue" on the list adds up **every invoice amount** (drafts and unpaid too, and skips standalone invoices with no project). The detail page uses **payments**. The same client shows different numbers.
- **(unverified)** `ClientsView.tsx:22-23,76`: the "Client" kind (exactly one past project) has no filter chip. Also, the list's derived kind is unrelated to the editable `status` on the edit form (`ClientFormView.tsx:192`). There are two competing "status" ideas.
- **(unverified)** `ClientsView.tsx:96-101`: search doesn't match phone numbers. The ClientCombobox search does.
- **(unverified)** `ClientDetailView.tsx:790`: the client Tasks card hides completed tasks, while the opportunity Tasks card keeps them struck through (`OpportunityDetailView.tsx:1111`). The two cards behave differently.
- **(unverified)** Naming drift:
  - "Customer" (task and appointment dialogs, Communications) vs "Client" everywhere else (`TasksView.tsx:281`, `AppointmentsView.tsx:457`, `CommunicationsView.tsx:97,138`)
  - "Project types" (CreateOpportunityDialog, which shows catch-all categories) vs "Features" (opportunity Details, which hides catch-alls) vs "All types" (Pipeline filter) vs "section per project type" (Estimate checkbox)
  - "Cost plan" in the UI vs `/materials` route, `MaterialsSheet` / `sheet.name` rows, and "Start estimate" (`OpportunityDetailView.tsx:602`, `AppointmentsView.tsx:271`)
- **(unverified)** `ClientFormView.tsx:213`: the client's Lead source is free text, while opportunities use the Settings lead-source list (`LeadSourceSelect`). Values won't line up in the By source ROI.
- **(unverified)** `OpportunityDetailView.tsx:303-308`: feature types are stored on the opportunity until a project exists, then on the project. The first measurement or photo save creates the project, so check that types chosen earlier carry over.
- **(unverified)** `OpportunityDetailView.tsx:920-924`: every cost plan row links to the same `/projects/:id/materials`, whichever sheet it is.

#### Permissions
- **(unverified)** `src/components/layout/AppLayout.tsx:93`: every page here is owner-only because employees are redirected, and there's no finer role check. `ClientHubCard` (`ClientDetailView.tsx:380-385`) sends a portal magic link to whatever email is on file, with no confirm and no rate limit on "Resend link".

---

## Area 03 — Projects, schedule, deliveries

Scope: `/projects`, `/projects/new`, `/projects/:id` (every card except the Cost plan builder, quotes, change orders
and invoices, which other checklists cover), `/projects/:id/labor`, `/projects/:id/expenses`,
`/projects/:id/material-orders`, `/projects/:id/work-order`, `/projects/:id/client-view`, `/bookings` (+ `/backlog`
redirect) and the shared weather components.

Roles: **Owner** = signed-in contractor (owner app). **Crew** = employee login (only where a shared component also
renders in the crew app). **Client** = Client Hub. Every route here is owner-only: `AppLayout` sends an employee
role to `/employee`.

Status and Note columns are left empty on purpose. Fill them in during manual testing.

---

### 1. `/projects` — Projects list

`src/components/views/ProjectsView.tsx` (+ `common/FilterControls`, `common/SearchInput`, `common/ListCard`, `common/CategoryChips`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1.1 | "+ New" (mobile header) | Button | Go to `/projects/new` | Owner | | |
| 1.2 | "+ New project" (desktop header) | Button | Go to `/projects/new` | Owner | | |
| 1.3 | Search (mobile header) | Text input | Filter by project name or client name, case-insensitive | Owner | | |
| 1.4 | Search (desktop) | Text input | Same filter as 1.3 (shared state) | Owner | | |
| 1.5 | Status filter segment (desktop) | Segmented tabs | All / Estimating / Scheduled / In progress / Complete / Archived, each with a count. "All" means Scheduled + In progress + Complete only | Owner | | |
| 1.6 | Status filter pills (mobile) | Pill tabs | Same as 1.5 | Owner | | |
| 1.7 | "All types" select | Select | Filter by job category (features); "All types" clears it | Owner | | |
| 1.8 | Desktop table row | Whole-row click | Open `/projects/:id` | Owner | | |
| 1.9 | Mobile ListCard | Whole-card link | Open `/projects/:id` | Owner | | |
| 1.10 | Contract column / eyebrow amount | Display | Headline quote plus approved change orders; "—" when 0 | Owner | | |
| 1.11 | Stage / Progress / Next columns | Display (demo) | Presentation-only demo data (`demoJobMeta`), not live | Owner | | |
| 1.12 | Header subtitle | Display | "N projects · $X under contract · N weeks booked out" (weeks is demo) | Owner | | |
| 1.13 | Loading / error / empty states | State | "Loading projects…", error text, "No projects yet…", "No projects here." per filter | Owner | | |
| 1.14 | Pre-sale projects hidden | Rule | Projects behind a not-yet-Won opportunity never appear in any tab | Owner | | |

### 2. `/projects/new` — New project

`src/components/views/NewProjectView.tsx`, `src/components/common/ClientPicker.tsx` (`ClientCombobox`), `hooks/use-client-field`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 2.1 | Back link | Link | "Projects", or "Back to quote" when opened with `state.linkQuoteId` | Owner | | |
| 2.2 | Project name | Text input (autofocus) | Required; Create is disabled while it's blank | Owner | | |
| 2.3 | Client search | Combobox input | Type to search clients; ↑/↓/Enter to pick; Esc closes the list | Owner | | |
| 2.4 | Client result row | List option | Picks that client | Owner | | |
| 2.5 | "Add "…" as new client" option | List option | Opens the inline new-client draft, prefilled with the typed name | Owner | | |
| 2.6 | "New client" link | Button | Opens an empty new-client draft | Owner | | |
| 2.7 | Selected client "×" | Icon button | Clears the client and refocuses search | Owner | | |
| 2.8 | New-client draft: Name / Phone / Email / Address | Inputs | Name plus a phone or an email are required; a live hint explains why Create is disabled | Owner | | |
| 2.9 | New-client draft "Cancel" | Button | Discards the draft | Owner | | |
| 2.10 | Duplicate warning "Use existing" | Button | Picks the matching existing client | Owner | | |
| 2.11 | Duplicate warning "Create anyway" | Button | Accepts the duplicate and creates the project straight away | Owner | | |
| 2.12 | Cancel | Button | Back to `/projects` (or back to the quote) | Owner | | |
| 2.13 | Create project | Button | Creates the client if drafted, then the project (status Estimating), logs a "Project created" event and opens it. With `linkQuoteId`, moves the quote onto the project and returns to the quote | Owner | | |

---

### 3. `/projects/:id` — Project detail

`src/components/views/ProjectDetailView.tsx` (the page and its inline cards: `ProfitSummaryCard`, `MaterialsTrackingCard`,
`ReconcileMaterialsDialog`, `HubCard`, `ProjectMessagesCard`, `FieldUpdatesCard`)

#### 3.1 Header, status and start guard

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.1.1 | Mobile header back ("Projects") | Link | Go to `/projects` | Owner | | |
| 3.1.2 | Desktop BackLink "Projects" | Link | Go to `/projects` | Owner | | |
| 3.1.3 | Title, status pill, client and crew subtitle | Display | Live project name, status, client name ("No client"), crew name | Owner | | |
| 3.1.4 | Status select (desktop right, mobile below header) | Select | Estimating / Scheduled / In progress / Complete / Lost. Saves at once and logs a "Status →" event | Owner | | |
| 3.1.5 | Status → In progress with required pre-con items open | Guard dialog | Shows "Start with items still open?" and lists the open items | Owner | | |
| 3.1.6 | Start guard "Cancel" | Button | Keeps the old status | Owner | | |
| 3.1.7 | Start guard "Start anyway" | Button | Applies the change | Owner | | |
| 3.1.8 | Status → Complete | Side effect | Opens the Closeout dialog (3.12.7) | Owner | | |
| 3.1.9 | Loading / error | State | "Loading project…" / "Failed to load project: …" | Owner | | |

#### 3.2 Features chips (project types)

`src/components/measurements/MeasuredCategoryMultiSelect.tsx`, `src/components/common/FeatureTypeChips.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.2.1 | "Add features…" placeholder (no features yet) | Button | Opens the picker | Owner | | |
| 3.2.2 | Feature chip | Button | Opens the picker | Owner | | |
| 3.2.3 | Edit (pencil) | Icon button | Opens the picker: a popover on desktop, a bottom sheet on phones | Owner | | |
| 3.2.4 | "+N more" chip | Button | Expands to show every chip (appears past 3 rows) | Owner | | |
| 3.2.5 | "Show less" | Button | Collapses back to 3 rows | Owner | | |
| 3.2.6 | Picker item (category) | Command item toggle | Add or remove that type; saves at once (`setProjectFeatureTypes`). Catch-all "Other / Uncategorized" types are hidden | Owner | | |
| 3.2.7 | Remove a type with saved measurements | Confirm dialog | "Remove X?". "Keep it" cancels; "Remove type" hides the card and keeps the data | Owner | | |
| 3.2.8 | Empty categories | State | "No categories yet — add some in Settings." | Owner | | |

#### 3.3 Pre-sale banner and pipeline link

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.3.1 | "This job hasn't been won yet." banner | Display (pre-sale only) | Shows when a linked opportunity isn't Won | Owner | | |
| 3.3.2 | "Back to opportunity" | Link | Go to `/pipeline/:opportunityId` | Owner | | |
| 3.3.3 | "From pipeline:" opportunity title | Link (when linked) | Go to the opportunity; the stage pill shows next to it | Owner | | |

#### 3.4 "Won — project ready" banner

Shows only when the status is Scheduled or In progress and a CTA is still pending.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.4.1 | "Schedule this job" | Link button (no start date only) | Go to `/bookings` | Owner | | |
| 3.4.2 | "Send deposit invoice" (a deposit draft exists) | Link button | Open that draft invoice | Owner | | |
| 3.4.3 | "Send deposit invoice" (no deposit invoice; approved quote with a deposit %) | Button | Creates a prefilled deposit invoice and opens it; shows "Preparing…" while busy | Owner | | |

#### 3.5 Pre-construction card

`src/components/precon/PreconCard.tsx`, `PreconItemSheet.tsx`, `usePrecon.ts`. Visible from Won until the job starts. Hidden for Estimating, Lost and Complete. After the start it collapses, and it disappears once everything is done.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.5.1 | Readiness pill | Display | Ready / "N items open" / Blocked (before start only) | Owner | | |
| 3.5.2 | "N of M ready · starts in N days" + progress bar | Display | Live counts; the bar turns red when blocked | Owner | | |
| 3.5.3 | ⋯ "Checklist options" | Dropdown menu | Opens the menu | Owner | | |
| 3.5.4 | ⋯ → "Edit this job's checklist" | Menu item | Switches to the inline list editor (3.5.6–3.5.11) | Owner | | |
| 3.5.5 | ⋯ → "Edit default checklist" | Menu item | Go to `/settings/precon` | Owner | | |
| 3.5.6 | List editor: item label | Text input | Rename (draft only) | Owner | | |
| 3.5.7 | List editor: Move up / Move down | Icon buttons | Reorder (draft); disabled at the ends | Owner | | |
| 3.5.8 | List editor: Remove (×) | Icon button | Remove from this job (draft) | Owner | | |
| 3.5.9 | List editor: Cancel | Button | Discard the draft | Owner | | |
| 3.5.10 | List editor: "Save checklist" | Button | Saves renames, order and removals together | Owner | | |
| 3.5.11 | "Started with N open items" | Toggle button (after start) | Expands or collapses the list | Owner | | |
| 3.5.12 | 811 ticket box | Display | Ticket # and clear-to-dig / expiry; tinted when there are warnings | Owner | | |
| 3.5.13 | Checklist row | Whole-row button | Opens the item sheet (3.5.19) | Owner | | |
| 3.5.14 | Quick action button (open items) | Button | Open quotes / Open quote / Record payment (opens the Record payment sheet) / Open cost plan / Assign crew (scrolls to the Schedule card) / Send start confirmation (opens the heads-up sheet; toast if there's no client) | Owner | | |
| 3.5.15 | "Mark confirmed" (start-confirmed item) | Button | Marks it done by hand; nothing is sent to the client | Owner | | |
| 3.5.16 | "Add 811 ticket" (locate item, no ticket) | Button | Opens the item sheet | Owner | | |
| 3.5.17 | "+ Add item for this job" | Button | Shows the add row | Owner | | |
| 3.5.18 | Add row: label + "Add" | Input + button | Adds a required item for this job only; Add is disabled while blank | Owner | | |
| 3.5.19 | Item sheet (bottom sheet on phones, right sheet on desktop) | Sheet | Title, description, fields by kind | Owner | | |
| 3.5.20 | Sheet (automatic item): "Mark by hand" | Switch | Overrides the automatic result | Owner | | |
| 3.5.21 | Sheet (automatic item, overridden): Open / Done / N/A | Segmented | Sets the manual state | Owner | | |
| 3.5.22 | Sheet (HOA / permit): Not needed / Submitted / Approved | Segmented | Sets the status (Approved → done, Not needed → N/A) | Owner | | |
| 3.5.23 | Sheet (permit): Permit # | Text input | Saved in the details | Owner | | |
| 3.5.24 | Sheet (HOA / permit): Submitted on / Approved on | Date input | Saved in the details | Owner | | |
| 3.5.25 | Sheet (HOA / permit): "N/A for this job" | Switch | Marks it N/A | Owner | | |
| 3.5.26 | Sheet (811): ticket # | Text input | Saved in the details | Owner | | |
| 3.5.27 | Sheet (811): Date called / submitted | Date input | Computes clear-to-dig and expiry live (working days from settings) | Owner | | |
| 3.5.28 | Sheet (811): Needed / N/A | Segmented | Sets the state | Owner | | |
| 3.5.29 | Sheet (custom item): Open / Done / N/A | Segmented | Sets the state | Owner | | |
| 3.5.30 | Sheet: "Add photo / document" / "Replace…" | File button (image or PDF) | Uploads at once; shows "Uploading…" | Owner | | |
| 3.5.31 | Sheet: "View file" | External link | Opens the signed URL | Owner | | |
| 3.5.32 | Sheet: Note | Textarea | Saved on Save | Owner | | |
| 3.5.33 | Sheet: "Remove from this job" | Text button | Removes the item at once (no confirm) | Owner | | |
| 3.5.34 | Sheet: Cancel / Save | Buttons | Close / save and refresh the precon data | Owner | | |

#### 3.6 Material alerts bar

`src/components/materials/MaterialAlertsBar.tsx` (shared with the Cost plan). Renders nothing when there are no alerts or while snoozed.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.6.1 | Summary bar "… Review" | Toggle button | Desktop: expands inline (capped height). Phone: opens a bottom sheet | Owner | | |
| 3.6.2 | Group header (section / Deliveries / Other) | Toggle button | Expands or collapses that group's alert lines | Owner | | |
| 3.6.3 | "Open in cost plan" | Link | `/projects/:id/materials#section-…` | Owner | | |
| 3.6.4 | "Mark as ordered" (group has not-ordered lines) | Button | Logs one order for those lines, with a toast; disabled while busy | Owner | | |
| 3.6.5 | Alert line label | Link | Cost-plan line (`#line-…`), or `/material-orders` for delivery alerts | Owner | | |
| 3.6.6 | "Not needed" | Button | Turns tracking off for that line, with a toast | Owner | | |
| 3.6.7 | "Snooze 3 days" | Button | Hides the bar for this project for 3 days (localStorage) | Owner | | |

#### 3.7 Reconcile materials (Complete jobs with unreconciled lines)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.7.1 | "Reconcile materials" banner button | Button | Opens the dialog; the banner shows the count of lines needing a disposition | Owner | | |
| 3.7.2 | Per-line disposition | Select | Returned to supplier / Kept in stock / Waste (Kept is preselected) | Owner | | |
| 3.7.3 | Credit $ (Returned only) | Number input | Return credit that lowers actual material cost | Owner | | |
| 3.7.4 | "Save reconciliation" | Button | Saves each line's disposition plus a learning snapshot; shows a toast and closes | Owner | | |
| 3.7.5 | Dialog close (×, overlay, Esc) | Dialog | Discard | Owner | | |

#### 3.8 Materials tracking card (active projects: not Estimating, not Lost, not pre-sale)

`MaterialsTrackingCard` (inline), `src/components/materials/LogUsageDialog.tsx`, `UsageLogHistoryDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.8.1 | "Open cost plan →" | Button | Go to `/projects/:id/materials` | Owner | | |
| 3.8.2 | "Used $X of $Y estimated" | Display | Sum of used × unit cost vs estimated qty × unit cost | Owner | | |
| 3.8.3 | Line row: used / est qty + unit, $ used of $ est, progress bar | Display | The bar turns red when over the estimate | Owner | | |
| 3.8.4 | "Log usage" (per line) | Button | Opens the Log usage dialog | Owner | | |
| 3.8.5 | "History (N)" (lines with entries) | Button | Opens the usage history dialog | Owner | | |
| 3.8.6 | "See all N materials" / "See less" | Toggle button | Shown when there are more than 5 rows | Owner | | |
| 3.8.7 | "N unplanned items" badge | Display | Shown when deliveries don't match any line | Owner | | |
| 3.8.8 | Empty state | State | "No tracked materials yet — add lines on the cost plan." | Owner | | |
| 3.8.9 | Log usage: Quantity used | Number input (decimal keypad, autofocus) | Required, must be > 0 | Owner | | |
| 3.8.10 | Log usage: Date | Date input (max today) | Defaults to today; clearing it resets to today | Owner | | |
| 3.8.11 | Log usage: Note | Textarea | Optional | Owner | | |
| 3.8.12 | Log usage: Logged by | Text input | Optional | Owner | | |
| 3.8.13 | Log usage: "Add a photo" | File (camera) | Preview with remove (×) | Owner | | |
| 3.8.14 | Log usage: "Log usage" submit | Button | Uploads the photo, adds the entry, shows a toast, closes; card totals update | Owner | | |
| 3.8.15 | History: Edit (pencil) | Icon button | Inline quantity input + Save | Owner | | |
| 3.8.16 | History: Save | Button | Updates the quantity (audit row written) | Owner | | |
| 3.8.17 | History: Delete (trash) | Icon button + confirm | "Delete this usage entry?" → Delete / Cancel | Owner | | |
| 3.8.18 | History: entry date | Display | Should show the logged date | Owner | | |

#### 3.9 "Change the job" (active projects) and the Add new work dialog

`src/components/projects/AddNewWorkDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.9.1 | "Change order" tile | Button | Go to `/projects/:id/change-orders` | Owner | | |
| 3.9.2 | "Add new work" tile | Button | Opens the Add new work dialog | Owner | | |
| 3.9.3 | `?add-new-work=1` deep link | URL param | Opens the dialog and strips the param | Owner | | |
| 3.9.4 | Category row | Toggle button | Pick or unpick; types already on the job read "Another X · already on this job" | Owner | | |
| 3.9.5 | Label (picked rows) | Text input | Optional feature label | Owner | | |
| 3.9.6 | "Create add-on quote (N features)" | Button | Creates proposed features, cost-plan sections and an add-on quote, then opens the quote; disabled when nothing is picked | Owner | | |
| 3.9.7 | Dialog close | Dialog | Closes (the picks are kept) | Owner | | |

#### 3.10 Hub cards

`HubCard` (inline). Each is a whole-card button with a live summary line.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.10.1 | Cost plan | Card button | `/projects/:id/materials`; "Not started" or "N cost plans · $ planned · N% margin" | Owner | | |
| 3.10.2 | Labor log | Card button | `/projects/:id/labor`; "Nothing logged" or "N hrs planned · N actual" | Owner | | |
| 3.10.3 | Quotes | Card button | `/projects/:id/quotes`; count · headline status · total | Owner | | |
| 3.10.4 | Invoices | Card button | `/projects/:id/invoices`; count · invoiced total | Owner | | |
| 3.10.5 | Expenses | Card button | `/projects/:id/expenses`; count · total | Owner | | |
| 3.10.6 | Change orders | Card button | `/projects/:id/change-orders`; "+$ approved · N pending" | Owner | | |
| 3.10.7 | Material orders | Card button | `/projects/:id/material-orders`; "N orders · N pending" | Owner | | |

#### 3.11 Profit summary (internal)

`ProfitSummaryCard` (inline), `src/components/projects/FeatureReport.tsx`, `src/components/overhead/TrueCostCard.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.11.1 | Quoted / Predicted cost / Actual cost | Display | Contract value / cost-plan total / logged actuals ("—" when unknown) | Owner | | |
| 3.11.2 | By-type table (Planned / Actual / Variance) | Display | Per cost bucket; variance green or red with a sign | Owner | | |
| 3.11.3 | Predicted / Actual profit (+%) | Display | Quoted − cost | Owner | | |
| 3.11.4 | Profit variance | Display | Actual − predicted profit, "Ahead / Behind estimate" | Owner | | |
| 3.11.5 | Fully loaded · internal | Display | Predicted and actual fully loaded profit with overhead $/hr and its source | Owner | | |
| 3.11.6 | "Set up overhead to see true profit →" (no overhead rate) | Link | `/settings/overhead` | Owner | | |
| 3.11.7 | Feature profit table (more than 1 active feature) | Expandable rows | Tap a feature row to expand it | Owner | | |
| 3.11.8 | "Includes $X of labor from timesheets not approved yet. Review timesheets" | Link (when pending labor) | `/timesheets` | Owner | | |

#### 3.12 Planned vs actual, job context and closeout

`src/components/planned-actual/PlannedVsActualCard.tsx`, `JobContextChips.tsx`, `CloseoutPanel.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.12.1 | Job context card (not active, not complete) | Chip groups | Slope / Access / Soil / Demo chips; tap to set, tap again to clear; saves optimistically | Owner | | |
| 3.12.2 | Planned vs actual card (active or complete) | Display | Biggest variances, profit impact and bridge, info notes | Owner | | |
| 3.12.3 | "Whole project" row | Toggle button (open by default) | Expands the buckets, total and man-hours | Owner | | |
| 3.12.4 | Feature row | Toggle button | Expands buckets, labor and material lines | Owner | | |
| 3.12.5 | Job context chips (inside the card) | Chip groups | Same as 3.12.1, plus the crew size read from labor | Owner | | |
| 3.12.6 | Closeout panel (Complete): "Create closeout" / "Re-run closeout" | Button | Opens the closeout dialog | Owner | | |
| 3.12.7 | Closeout dialog: unreconciled warning | Display | Shows when lines aren't reconciled | Owner | | |
| 3.12.8 | Closeout dialog: What happened | Textarea | Optional note | Owner | | |
| 3.12.9 | Closeout dialog: Exclude from comparisons | Checkbox | Keeps the job out of averages | Owner | | |
| 3.12.10 | Closeout dialog: "Not now" / "Save closeout" | Buttons | Close / save a frozen snapshot, with a toast | Owner | | |
| 3.12.11 | Closeout summary: What happened | Textarea (saves on blur) | Updates the closeout note | Owner | | |
| 3.12.12 | Closeout summary: Exclude from comparisons | Checkbox (saves at once) | Updates the closeout | Owner | | |
| 3.12.13 | "Estimating insights →" | Link | `/settings/estimating-insights` | Owner | | |

#### 3.13 Client selections (when approved or pending selections exist)

`src/components/selections/ProjectSelectionsCard.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.13.1 | "N change requests" badge | Display | Count of open client requests | Owner | | |
| 3.13.2 | Selection row "Create change order" | Button | Opens the selection change dialog | Owner | | |
| 3.13.3 | Request row "Create change order" | Button | Opens the dialog with the requested option preselected | Owner | | |
| 3.13.4 | Request row "Close request" | Button | Closes the client's request | Owner | | |
| 3.13.5 | Dialog option buttons | Toggle buttons | Single or multi select; "current" tag on the current pick | Owner | | |
| 3.13.6 | Dialog price and cost change preview | Display | Client price delta (a $0 change still makes a $0 CO) and internal cost delta | Owner | | |
| 3.13.7 | Dialog Cancel / "Create change order" | Buttons | Creates a draft CO and opens it; disabled when nothing changed | Owner | | |

#### 3.14 Costs to date

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.14.1 | "Manage" / "Add expense" | Link | `/projects/:id/expenses` | Owner | | |
| 3.14.2 | Total + last 5 expenses + "+N more" | Display | Logged expenses only | Owner | | |

#### 3.15 Money card, payments and receipts

Money card inline; `src/components/payments/RecordPaymentSheet.tsx`, `PaymentsList.tsx`, `common/ShareLinkDialog`, `client-hub/DownloadSummaryButton.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.15.1 | Billing badge | Display | e.g. deposit due / paid, from contract vs invoiced vs paid | Owner | | |
| 3.15.2 | Money rows | Display | Contract value, Invoiced, Payments received, Unpaid invoice balance, Unallocated credit (if any), Remaining balance or Credit balance (overpaid) | Owner | | |
| 3.15.3 | "+ Record payment" | Button | Opens the Record payment sheet (bottom sheet on phones, dialog on desktop) | Owner | | |
| 3.15.4 | Record: Amount | Text input (decimal) | Required, > 0; "$" and "," stripped | Owner | | |
| 3.15.5 | Record: Date received | Date input | Required; defaults to today | Owner | | |
| 3.15.6 | Record: Method chips | Toggle buttons | Check / Cash / Card / ACH / Zelle / Venmo / Other | Owner | | |
| 3.15.7 | Record: Check # / Reference | Text input | Label changes with the method | Owner | | |
| 3.15.8 | Record: Note | Textarea | Internal note, not on the receipt | Owner | | |
| 3.15.9 | Record: "Apply to invoice" | Checkbox | Disabled when there are no open (non-draft) invoices | Owner | | |
| 3.15.10 | Record: per-invoice apply amount | Text input | Can't exceed that invoice's open balance | Owner | | |
| 3.15.11 | Record: "Fill oldest first" | Button | Auto-allocates oldest first | Owner | | |
| 3.15.12 | Record: credit / over indicator | Display | "$X stays as project credit" or "$X over" | Owner | | |
| 3.15.13 | Record: Cancel / "Record $X" | Buttons | Creates the payment and receipt, invalidates the money queries, shows a toast | Owner | | |
| 3.15.14 | Payment row receipt # | External link | `/receipt/:token` in a new tab | Owner | | |
| 3.15.15 | Payment row ⋯ | Dropdown menu | Opens the menu | Owner | | |
| 3.15.16 | ⋯ → View receipt | Menu link | Opens the receipt page | Owner | | |
| 3.15.17 | ⋯ → Download PDF | Menu item | Builds and downloads the receipt PDF | Owner | | |
| 3.15.18 | ⋯ → Send receipt | Menu item | Opens the share-link dialog for the receipt | Owner | | |
| 3.15.19 | ⋯ → Edit (not void) | Menu item | Opens the sheet in edit mode (existing allocations prefilled) | Owner | | |
| 3.15.20 | ⋯ → History | Menu item | Payment history dialog (every change, who made it) | Owner | | |
| 3.15.21 | ⋯ → Void | Menu item | Void dialog: Reason textarea, Cancel / "Void payment" | Owner | | |
| 3.15.22 | ⋯ → Restore (voided) | Menu item | Restores the payment | Owner | | |
| 3.15.23 | Voided payment display | Display | Struck through, VOID badge, reason; counts nowhere | Owner | | |
| 3.15.24 | "Client view" | Link button | `/projects/:id/client-view` | Owner | | |
| 3.15.25 | "Project summary" | Button | Fetches the client-safe payload and downloads the summary PDF; shows a spinner while busy | Owner | | |
| 3.15.26 | "Deposit not received" alert | Display | Shows when the deposit is overdue | Owner | | |
| 3.15.27 | Actual / Projected margin box | Display | % and $ | Owner | | |

#### 3.16 Crew work order card (every status except Estimating and Lost)

`src/components/workorder/CrewWorkOrderCard.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.16.1 | "Preview" | Link button | `/projects/:id/work-order` | Owner | | |
| 3.16.2 | Review status line | Display | "Reviewed by X · date", "Scope changed since…", or "Not reviewed…" | Owner | | |
| 3.16.3 | Crew notes / special instructions | Textarea | Draft; Save appears once edited | Owner | | |
| 3.16.4 | Crew note photo "×" | Icon button | Removes the photo from the list at once | Owner | | |
| 3.16.5 | "Photo" | File button (multi) | Uploads and appends to the crew-note photos | Owner | | |
| 3.16.6 | Client notes for the crew | Textarea | Draft | Owner | | |
| 3.16.7 | "Save notes" (when dirty) | Button | Saves both notes | Owner | | |
| 3.16.8 | "Hide the client's phone number from the crew" | Switch | Saves at once | Owner | | |

#### 3.17 Review card (Complete jobs with a client)

`src/components/reviews/ProjectReviewCard.tsx`, `ReviewRequestSheet.tsx`, `messaging/ClientMessageComposer.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.17.1 | Stage label + history line | Display | Not asked / Asked / Clicked / Left / Dismissed / Opted out / Off | Owner | | |
| 3.17.2 | "Settings › Reviews" (stage off) | Link | `/settings/reviews` | Owner | | |
| 3.17.3 | "Ask {first name} for a review" / "Request review" | Button | Opens the request sheet | Owner | | |
| 3.17.4 | "Remind {first name}" (remind stage) | Button | Opens the sheet in reminder mode | Owner | | |
| 3.17.5 | "Review left" | Button | Marks the review as left | Owner | | |
| 3.17.6 | Undo (stage left) | Button | Back to clicked or asked | Owner | | |
| 3.17.7 | Dismiss | Button | Dismisses the request | Owner | | |
| 3.17.8 | `?review=ask` / `?review=remind` | URL param | Opens the sheet straight away, then strips the param | Owner | | |
| 3.17.9 | Sheet: message | Textarea | Prefilled from the template with a tracked `/r/{token}` link; editable | Owner | | |
| 3.17.10 | Sheet: Text / Email | Buttons | Open the native SMS / mail app; "No phone/email on file · Add" when missing | Owner | | |
| 3.17.11 | Sheet: Copy | Button | Copies the message | Owner | | |
| 3.17.12 | Sheet: "Mark as sent?" → "Not yet" / "Yes, sent" | Buttons | Records the send | Owner | | |
| 3.17.13 | Sheet: "Settings › Reviews" (no link set) | Link | Closes the sheet and goes to settings | Owner | | |
| 3.17.14 | Sheet: Close / Done | Button | Closes | Owner | | |

#### 3.18 Care & maintenance (Complete jobs with a client)

`src/components/maintenance/MaintenanceCard.tsx`, `MaintenanceSetupSheet.tsx`, `useMaintenance.ts`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.18.1 | "Add maintenance reminders" (none yet) | Button | Opens the setup sheet | Owner | | |
| 3.18.2 | "Not for this job" | Button | Dismisses the setup | Owner | | |
| 3.18.3 | "Add" (header, when items exist) | Button | Opens the setup sheet (only suggestions not set up yet) | Owner | | |
| 3.18.4 | Item: "Reach out" (not as-needed) | Button | Opens the reach-out dialog | Owner | | |
| 3.18.5 | Item ⋯ | Dropdown menu | Opens the menu | Owner | | |
| 3.18.6 | ⋯ → Create opportunity | Menu item | Creates a maintenance opportunity, with a toast | Owner | | |
| 3.18.7 | ⋯ → Snooze 1 month / Snooze 3 months | Menu items | Sets snoozed-until and logs an event | Owner | | |
| 3.18.8 | ⋯ → Skip this time | Menu item | Next due counts from this due date | Owner | | |
| 3.18.9 | ⋯ → Mark done (schedule next) | Menu item | Sets last-done today and the next due date | Owner | | |
| 3.18.10 | ⋯ → Stop reminders | Menu item | Stops (no confirm) | Owner | | |
| 3.18.11 | Stopped item "Resume" | Button | Reactivates | Owner | | |
| 3.18.12 | "Opportunity open →" | Link | `/pipeline/:id` | Owner | | |
| 3.18.13 | "History (N)" | Toggle button | Expands the event history | Owner | | |
| 3.18.14 | Warranty lines | Display | "{feature} warranty until {date}" | Owner | | |
| 3.18.15 | Client opted-out note | Display | Shows when the client opted out in the Hub | Owner | | |
| 3.18.16 | `?maintenance=setup` / `?maintenance=<itemId>` | URL param | Opens setup / reach-out for that item | Owner | | |
| 3.18.17 | Setup: suggestion | Checkbox | Pick (all preselected) | Owner | | |
| 3.18.18 | Setup: First reminder | Date input | Overrides the suggested due date | Owner | | |
| 3.18.19 | Setup: Warranty ends (per feature) | Date input | Defaults from the warranty years in settings | Owner | | |
| 3.18.20 | Setup: Cancel / "Save N reminders" / "Save warranty" | Buttons | Creates the items and warranties | Owner | | |
| 3.18.21 | Reach out: message | Textarea | Prefilled maintenance message | Owner | | |
| 3.18.22 | Reach out: Text / Email / Copy → Mark as sent | Composer | Logs a reached-out event and client activity | Owner | | |
| 3.18.23 | Reach out: "They're in — create opportunity" | Button | Creates an opportunity and closes | Owner | | |

#### 3.19 Schedule card

Schedule card inline; `src/components/schedule/ScheduleMenu.tsx`, `CrewSelect.tsx`, `HeadsUpReminder.tsx`, `HeadsUpSheet.tsx`,
`HeadsUpStep.tsx`, `RainDelaySheet.tsx`, `RainDelayProvider.tsx`, `ScheduleDelaysList.tsx`, `useUndoScheduleDelay.tsx`, `src/components/weather/*`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.19.1 | Schedule ⋯ (only with a start date) | Dropdown menu | Opens the menu | Owner | | |
| 3.19.2 | ⋯ → "Delay job…" | Menu item | Opens the Rain delay sheet (default day, reason rain) | Owner | | |
| 3.19.3 | ⋯ → "Confirm start date with client…" | Menu item | Creates a start confirmation and opens the heads-up sheet; toast if there's no client | Owner | | |
| 3.19.4 | Start date | Date input | Saves at once; blocked with a toast if it's after the end date | Owner | | |
| 3.19.5 | End date (min = start) | Date input | Saves at once; blocked with a toast if it's before the start | Owner | | |
| 3.19.6 | Heads-up reminder "Send schedule update" | Button | Opens the heads-up sheet for pending updates | Owner | | |
| 3.19.7 | Heads-up reminder "Dismiss" | Button | Dismisses all pending updates | Owner | | |
| 3.19.8 | Crew | Select | No crew / crews / "Manage crews" link (`/settings/team`); saves at once | Owner | | |
| 3.19.9 | Forecast strip (start set, not complete or lost) | Tiles | Upcoming work days: icon, rain %, inches, high. Risky days tinted | Owner, Crew | | |
| 3.19.10 | Forecast day tile | Popover button | Why it's flagged; rain %, amount, high / low | Owner, Crew | | |
| 3.19.11 | Popover "Rain delay" (risky day) | Button | Closes the popover and opens the Rain delay sheet for that day | Owner | | |
| 3.19.12 | Forecast notes | State | "Add a valid address…", "US addresses only", "Forecast unavailable…", "Forecast shows once work days are within about a week.", "No work days left…" | Owner, Crew | | |
| 3.19.13 | Delays list row | Display | Own delay or cascaded shift; reason, mode, note, date, by | Owner, Crew | | |
| 3.19.14 | Delays list "Undo" | Button | All-or-nothing undo, with a toast; greyed once undone | Owner | | |
| 3.19.15 | Estimated duration (none): Days + "Add" | Number input + button | Sets estimated crew days (must be > 0) | Owner | | |
| 3.19.16 | Estimated duration (set): days | Number input | Saves on every change; clearing removes the estimate | Owner | | |
| 3.19.17 | "N working days · +N weather days" | Display | Shows when there are weather delays | Owner | | |
| 3.19.18 | Actual start | Date input | First set → pre-con start guard, then a "Work started" event | Owner | | |
| 3.19.19 | Actual end (min = actual start) | Date input | Saves at once | Owner | | |
| 3.19.20 | Day X of Y / Took N days + bar | Display | Red when over (weather days excluded) | Owner | | |
| 3.19.21 | Window warning | Display | "Estimate exceeds scheduled window by N days" | Owner | | |

##### 3.19a Rain delay sheet (right sheet on desktop, bottom sheet on phones)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.19a.1 | Day affected | Date input | Which day the delay starts | Owner | | |
| 3.19a.2 | Delay by: 1 / 2 / Other | Toggle buttons | Other shows a custom days input (1–60) | Owner | | |
| 3.19a.3 | Reason chips | Toggle buttons | Rain / Weather – other / Material delay / Client request / Other | Owner | | |
| 3.19a.4 | Note | Textarea | Optional | Owner | | |
| 3.19a.5 | "Shift {crew}'s jobs behind it" (crew set) | Switch | Cascades the same crew's later jobs (default on) | Owner | | |
| 3.19a.6 | Preview list | Display | Each moved job with from → to; "extend" vs "push" mode | Owner | | |
| 3.19a.7 | 811 / overlap warnings | Display | Locate-expiry and plan warnings | Owner | | |
| 3.19a.8 | Delivery on moved days | Checkbox per delivery | Also move that delivery date | Owner | | |
| 3.19a.9 | Appointment on moved days "Reschedule" | Link button | Opportunity page (or `/appointments`); closes the sheet | Owner | | |
| 3.19a.10 | Cancel / "Confirm delay" | Buttons | Applies atomically; toast with Undo; then shows the heads-up step | Owner | | |
| 3.19a.11 | Toast "Undo" | Toast action | Undoes the delay | Owner | | |

##### 3.19b Heads-up step / sheet (after a delay, from the reminder, or from Confirm start)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.19b.1 | "Post in the Client Hub" | Switch | Posts or unposts the date changes to each client's Hub (real date changes only) | Owner | | |
| 3.19b.2 | Per-client card: message | Textarea | Template-filled, editable | Owner | | |
| 3.19b.3 | Per-client card: Text / Email / Copy | Buttons | Native send, then "Mark as sent?" | Owner | | |
| 3.19b.4 | "Not yet" / "Yes, sent" | Buttons | Records the send (badge "Sent · channel") | Owner | | |
| 3.19b.5 | "No phone/email on file · Add" | Link | To the client's edit page | Owner | | |
| 3.19b.6 | Skip | Button | Marks it skipped | Owner | | |
| 3.19b.7 | "Undo skip" | Button | Back to pending | Owner | | |
| 3.19b.8 | Done | Button | Closes; anything unsent stays as a reminder | Owner | | |

#### 3.20 Measurements card

`src/components/common/ProjectMeasurementsCard.tsx`, `src/components/measurements/FeatureCard.tsx`, `editors.tsx`, `fields.tsx`, `common/DraftSaveBar`, `common/CollapseAllLinks`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.20.1 | Card header | Toggle button | Collapse or expand (remembered per user); summary "N features · N measured · N empty" when collapsed | Owner | | |
| 3.20.2 | "Collapse all / Expand all" (more than 1 group) | Buttons | Every feature card | Owner | | |
| 3.20.3 | Feature card header | Toggle button | Collapse or expand; summary or rollup | Owner | | |
| 3.20.4 | Instance label | Text input | Feature label (becomes the project feature's label on save) | Owner | | |
| 3.20.5 | Remove / Clear instance (trash) | Icon button | Removes the instance (draft) | Owner | | |
| 3.20.6 | "+ Add another {noun}" | Button | Adds an instance, which becomes a new feature on save | Owner | | |
| 3.20.7 | Area builder: Dimensions / Total sq ft | Segmented | Measurement method | Owner | | |
| 3.20.8 | Area builder: shape | Segmented | Rectangle / L / U / Irregular (varies by type) | Owner | | |
| 3.20.9 | Area builder: length / width / edge fields, "Add area", remove area, diagram flip | Number inputs + buttons | Computes the area live | Owner | | |
| 3.20.10 | Wall / seating / kitchen editors: runs, heights, "Add run", Backsplash / Backrest toggles | Inputs, toggles, buttons | Per-type fields; defaults come from Smart Section tunables | Owner | | |
| 3.20.11 | Fire pit: Round / Rect / Custom + fields | Segmented + inputs | Diameter or L×W, or a description and approximate sq ft | Owner | | |
| 3.20.12 | Fireplace / Lighting (fixture rows, "Add fixture type") / Steps ("Add step section") | Inputs + buttons | Per-type fields | Owner | | |
| 3.20.13 | Custom measurement row: label / qty / unit / remove | Input, input, select, button | Reference only, not in totals | Owner | | |
| 3.20.14 | "Add custom measurement" | Button | Adds a custom row | Owner | | |
| 3.20.15 | Draft save bar: Discard / Save | Buttons | Discard reseeds from the server; Save diffs and writes, syncs features / sections, toast "Measurements saved" | Owner | | |
| 3.20.16 | `#measure` / `#measure-<categoryId>` deep link | URL hash | Expands, scrolls to the card, pulses it and focuses the first field | Owner | | |
| 3.20.17 | No types selected | State | "Pick a project type to get its measurement card." | Owner | | |

#### 3.21 Client card (when a client is set)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.21.1 | Whole card (click, Enter, Space) | Card button | `/clients/:clientId/edit` | Owner | | |
| 3.21.2 | Phone | `tel:` link | Dials (doesn't open the card) | Owner | | |
| 3.21.3 | Email | `mailto:` link | Opens mail (doesn't open the card) | Owner | | |
| 3.21.4 | "Invite to client hub" (client has an email) | Button | Sends the magic-link invite and stamps `portal_invited_at`; toast | Owner | | |

#### 3.22 Activity

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.22.1 | Event list | Display | Every project event, newest first, with time ago; "No activity yet." when empty | Owner | | |

#### 3.23 Progress updates card (every status except Estimating and Lost)

`src/components/progress/ProgressUpdatesCard.tsx`, `PostUpdateSheet.tsx`, `MilestonesDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.23.1 | "Milestones" (disabled with no active features) | Button | Opens the milestones dialog | Owner | | |
| 3.23.2 | "Post update" | Button | Opens the post sheet | Owner | | |
| 3.23.3 | Post: Camera / Photos | File buttons | Adds photos (images only); preview with remove (×) | Owner, Crew | | |
| 3.23.4 | Post: note | Textarea | "What got done today?" | Owner, Crew | | |
| 3.23.5 | Post: Feature | Select | No feature / active features (auto-picked when there's only one) | Owner, Crew | | |
| 3.23.6 | Post: Milestone (after a feature is picked) | Select | That job's or the preset milestones | Owner, Crew | | |
| 3.23.7 | Post: "Share with client" | Switch | Owner: default on. Crew: default off, and needs office approval | Owner, Crew | | |
| 3.23.8 | Post: "Post" | Button | Saves at once; photos upload in the background; toast | Owner, Crew | | |
| 3.23.9 | Review queue row: "Share" | Button | Approves the crew post and shares it | Owner | | |
| 3.23.10 | Review queue row: "Edit note" → Save note | Toggle + button | Edits the crew note | Owner | | |
| 3.23.11 | Review queue row: "Keep internal" | Button | Marks it internal | Owner | | |
| 3.23.12 | Feed row photo | External link | Opens the signed photo URL | Owner | | |
| 3.23.13 | Feed row "Unshare" / "Share with client" | Button | Toggles shared | Owner | | |
| 3.23.14 | Feed row "Delete" | Button | Deletes the update | Owner | | |
| 3.23.15 | Feed row reply (when the client commented) | Textarea + send | Posts a reply | Owner | | |
| 3.23.16 | Client like / comments | Display | "The client liked this", comment thread | Owner | | |
| 3.23.17 | "Let {client} know?" dialog (after a first share, per setting) | Dialog + composer | Text / Email / Copy → Mark sent, or Skip; logs activity | Owner | | |
| 3.23.18 | "Before & after ▸" | Toggle button | Expands the picker | Owner | | |
| 3.23.19 | B&A feature buttons (more than 1 feature) | Toggle buttons | Pick the feature | Owner | | |
| 3.23.20 | B&A per-photo "before" / "after" | Toggle buttons | Mark or unmark the role for that feature | Owner | | |
| 3.23.21 | "Save pair to portfolio" | Button | Needs a before and an after; toast | Owner | | |
| 3.23.22 | Milestones dialog: rename input, Move up / down, Remove | Inputs + icon buttons | Per-feature draft list | Owner | | |
| 3.23.23 | Milestones dialog: "Add a milestone" + Add (Enter submits) | Form | Appends | Owner | | |
| 3.23.24 | Milestones dialog: "Reset to default" | Button | Restores the preset | Owner | | |
| 3.23.25 | Milestones dialog: Cancel / "Save milestones" | Buttons | Saves (a list that matches the preset is stored as "use preset") | Owner | | |

#### 3.24 Project Images gallery

`src/components/common/PhotoGallery.tsx` (owner = project)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.24.1 | "Share all with client" (some hidden) | Button | Makes every photo visible in the Hub | Owner | | |
| 3.24.2 | Visibility hint | Display | All visible / hidden / "N visible" | Owner | | |
| 3.24.3 | "From client" accept (✓) | Icon button | Moves the client photo into the gallery (still hidden) | Owner | | |
| 3.24.4 | "From client" reject (trash) | Icon button | Deletes the client photo | Owner | | |
| 3.24.5 | Thumbnail | Button | Opens the lightbox | Owner | | |
| 3.24.6 | Thumbnail eye toggle | Icon (role=button) | Share with or hide from the client | Owner | | |
| 3.24.7 | Add photos tile | File button (multi, camera) | Uploads; spinner while uploading | Owner | | |
| 3.24.8 | Lightbox: Caption | Text input | Saves on blur and on close | Owner | | |
| 3.24.9 | Lightbox: "Share with client" / "Hide from client" | Button | Toggles visibility | Owner | | |
| 3.24.10 | Lightbox: "Delete photo" | Button | Deletes at once and closes | Owner | | |
| 3.24.11 | Loading / empty states | State | "Loading…" / empty text | Owner | | |

#### 3.25 Messages (Client Hub thread)

`ProjectMessagesCard` (inline)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.25.1 | Thread | Display | "You" / "Client" bubbles, time ago, photos; scrolls (max height) | Owner | | |
| 3.25.2 | Message | Textarea | Body | Owner | | |
| 3.25.3 | Attach photos | Icon button + file input (multi) | Adds file chips | Owner | | |
| 3.25.4 | File chip "×" | Icon button | Removes the attachment | Owner | | |
| 3.25.5 | Send | Icon button | Sends (text or photos required), clears the box; spinner while sending | Owner | | |

#### 3.26 Field updates (only when crew notes exist)

`FieldUpdatesCard` (inline)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 3.26.1 | Update row | Display | Employee name, time ago, body | Owner | | |
| 3.26.2 | Delete (trash) | Icon button | Deletes the note (no confirm) | Owner | | |

---

### 4. `/projects/:id/labor` — Labor log

`src/components/views/ProjectLaborView.tsx` (+ `lib/laborPlan.ts`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 4.1 | "Back to project" | Link | `/projects/:id` | Owner | | |
| 4.2 | "cost plan" | Link | `/projects/:id/materials` | Owner | | |
| 4.3 | KPIs: Planned hours / Planned cost / Actual hours / Actual cost | Display | "—" when 0 | Owner | | |
| 4.4 | Whole-project variance banner | Display | Shows when there are both planned and actual hours | Owner | | |
| 4.5 | Productivity card (project size set) | Display | Planned and actual hrs/100sf, $/sf | Owner | | |
| 4.6 | Planned vs Actual by scope cards | Display | Per category, with a variance banner | Owner | | |
| 4.7 | Date | Date input | Defaults to today | Owner | | |
| 4.8 | Feature (job has features) or Scope (no features) | Select | General plus features, or General plus categories | Owner | | |
| 4.9 | Worker | Select | "Type a name…" or active employees | Owner | | |
| 4.10 | Worker name (custom) | Text input | Required for a custom worker | Owner | | |
| 4.11 | Crew days helper: Crew × Days × Hrs/day | 3 inputs | Fills Hours | Owner | | |
| 4.12 | Hours | Number input (0.25 step) | Required | Owner | | |
| 4.13 | Employee note | Display | "Goes on their timesheet…" (no rate or cost fields) | Owner | | |
| 4.14 | Rate $/hr (custom worker) | Number input | Optional; defaults to the business labor rate | Owner | | |
| 4.15 | Cost | Number input, or computed display | Hours × rate when a rate is set, otherwise typed | Owner | | |
| 4.16 | Note | Text input | Optional | Owner | | |
| 4.17 | "Log labor" | Button | Creates the entry, logs a project event, resets the form | Owner | | |
| 4.18 | Entries table | Display | Date, scope, worker, hours, cost; "pending approval" / "no pay rate" flags | Owner | | |
| 4.19 | Delete entry (trash) | Icon + confirm | "Delete this labor entry?" → Delete / Cancel | Owner | | |

### 5. `/projects/:id/expenses` — Expenses

`src/components/views/ProjectExpensesView.tsx`, `src/components/expenses/ExpenseCategoryPill.tsx`, `FeatureTypeSelects.tsx`, `ExpenseSplitDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 5.1 | "Back to project" | Link | `/projects/:id` | Owner | | |
| 5.2 | Add: Name | Text input | Required | Owner | | |
| 5.3 | Add: Amount | Number input | Required, numeric | Owner | | |
| 5.4 | Add: Date | Date input | Optional (blank by default) | Owner | | |
| 5.5 | Add: Category | Select | Uncategorized or an expense category | Owner | | |
| 5.6 | Add: Feature | Select | General or an active feature | Owner | | |
| 5.7 | Add: Cost type | Select | "From category" (shows the resolved type) or an explicit bucket | Owner | | |
| 5.8 | Add: Save | Button | Creates it, logs an event, resets the form | Owner | | |
| 5.9 | Row: category pill | Select | Recategorize at once; "Split across categories…" opens the split dialog | Owner | | |
| 5.10 | Row: "Split · N categories" chip (split) | Button | Reopens the split dialog | Owner | | |
| 5.11 | Row: date | Date input | Saves on change | Owner | | |
| 5.12 | Row: Feature / Cost type (not split) | Selects | Retag at once | Owner | | |
| 5.13 | Row: "Split — feature and type are set per line." | Display | Split rows | Owner | | |
| 5.14 | Row: Delete (trash) | Icon + confirm | "Delete "name"?" → Delete / Cancel | Owner | | |
| 5.15 | Total row | Display | Sum of amounts | Owner | | |
| 5.16 | Split: line category | Select | Per line | Owner | | |
| 5.17 | Split: line amount | Number input | Per line | Owner | | |
| 5.18 | Split: line description | Text input | Optional | Owner | | |
| 5.19 | Split: line Feature / Cost type | Selects | Per line | Owner | | |
| 5.20 | Split: remove line (trash) | Icon button | Removes the line | Owner | | |
| 5.21 | Split: "Add line" | Button | Adds an empty line | Owner | | |
| 5.22 | Split: allocated vs total + bar | Display | "Adds up", or "$X left" / "$X over" | Owner | | |
| 5.23 | Split: "Put the remaining $X in the last line" / "Take $X off the last line" | Button | Balances the last line | Owner | | |
| 5.24 | Split: Cancel / "Save split" / "Save anyway" | Buttons | Saves the lines; 0–1 lines turn it back into a normal expense | Owner | | |
| 5.25 | Loading / error / empty | State | Loading, error text, "No expenses logged yet…" | Owner | | |
| 5.26 | Receipt scan | n/a | Not on this page. It lives on Material orders (6.2–6.5) | Owner | | |

### 6. `/projects/:id/material-orders` — Material orders and deliveries

`src/components/views/ProjectMaterialOrdersView.tsx`, `common/SupplierCombobox`, `common/MaterialsLinePicker`, `common/PhotoGallery` (owner = material_order), `lib/assistant.extractReceipt`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 6.1 | Mobile back "Project" / desktop "Back to project" | Link | `/projects/:id` | Owner | | |
| 6.2 | "Take photo" | File button (camera) | Scans the receipt through the AI edge function | Owner | | |
| 6.3 | "Upload receipt" | File button (image / PDF) | Scans the receipt | Owner | | |
| 6.4 | Scan result | Side effect | Fills supplier (if blank), date, total and line items, sets Delivered, attaches the image; "Read N lines…" note, or no lines → skip-lines mode | Owner | | |
| 6.5 | "Reading the receipt…" | State | Spinner while scanning; Add is disabled | Owner | | |
| 6.6 | Supplier | Combobox | Pick recent or type new (MRU) | Owner | | |
| 6.7 | Expected delivery date / Delivery date | Date input | Label follows the status | Owner | | |
| 6.8 | Status | Select | Ordered — not here yet / Delivered | Owner | | |
| 6.9 | "No line items" | Switch | Skip lines (sets Delivered) | Owner | | |
| 6.10 | Total (skip lines) | Number input | Saved as one unplanned line | Owner | | |
| 6.11 | Line: description | Text input | Required for the line to save | Owner | | |
| 6.12 | Line: qty | Number input | Quantity | Owner | | |
| 6.13 | Line: unit | Select | Order units | Owner | | |
| 6.14 | Line: $/unit | Number input | Optional | Owner | | |
| 6.15 | Line: remove (trash) | Icon button | Disabled on the last line | Owner | | |
| 6.16 | Line: "Match — update its ordered / delivered quantity" suggestion | Button | Links the line to the suggested sheet line | Owner | | |
| 6.17 | Line: MaterialsLinePicker | Select | Match to any cost-plan line, or unmatch | Owner | | |
| 6.18 | "+ Add line item" | Button | Adds an empty line | Owner | | |
| 6.19 | Staged photos: add tile | File button (multi, camera) | Local previews until save | Owner | | |
| 6.20 | Staged photo "×" | Icon button | Removes the preview | Owner | | |
| 6.21 | Notes | Textarea | PO #, contact… | Owner | | |
| 6.22 | "Add order" / "Log delivery" | Button | Creates the order and uploads staged photos; resets the form | Owner | | |
| 6.23 | Order card status | Select | Ordered / Delivered / Delayed; saves at once | Owner | | |
| 6.24 | Order card delete (trash) | Icon + confirm | "Delete this material order?" | Owner | | |
| 6.25 | Delivery line chip (matched name / "Unplanned") | Toggle button | Opens the line editor | Owner | | |
| 6.26 | Line editor: MaterialsLinePicker | Select | Re-match or unmatch | Owner | | |
| 6.27 | Line editor: "Actual $/unit" | Number input (saves on blur) | Actual price | Owner | | |
| 6.28 | Line editor: line status | Select | "Same as order (…)", Ordered, Delivered, Delayed (partial delivery) | Owner | | |
| 6.29 | Partial-delivery note | Display | "This line: X (partial delivery)" | Owner | | |
| 6.30 | Delivery photos (per order) | PhotoGallery (bare) | Add, lightbox, caption, delete; no client-visibility controls | Owner | | |
| 6.31 | Loading / error / empty | State | Loading, error, "No material orders yet…" | Owner | | |

### 7. `/projects/:id/work-order` — Crew work order (owner preview)

`src/components/views/WorkOrderPage.tsx` (`WorkOrderPreviewPage`), `src/components/workorder/WorkOrderView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 7.1 | "Back to project" | Link | `/projects/:id` | Owner | | |
| 7.2 | Preview banner | Display | "exactly what your crew sees. No prices…" | Owner | | |
| 7.3 | Sticky header "Navigate" (address set) | External link | Maps directions | Owner, Crew | | |
| 7.4 | "New since you last opened this" | Display | Change list (crew only; opening is recorded for the crew only) | Crew | | |
| 7.5 | Offline banner | State | Read-only cached copy | Owner, Crew | | |
| 7.6 | "Post update" (crew only, online) | Button | Opens the crew post sheet (3.23.3–3.23.8) | Crew | | |
| 7.7 | Forecast strip | Tiles/popover | As 3.19.9–3.19.10 (no Rain delay action for crew) | Owner, Crew | | |
| 7.8 | "Reviewed" (crew lead, not yet reviewed) | Button | Records the review for this version | Crew (lead) | | |
| 7.9 | "PDF" (owner or lead) | Button | Downloads the work-order PDF with rasterized diagrams | Owner, Crew (lead) | | |
| 7.10 | Site: conditions, context chips, 811 box, permits | Display | Crew-safe site info | Owner, Crew | | |
| 7.11 | Client: Call / Text | `tel:` / `sms:` links | Hidden when "hide client phone" is on | Owner, Crew | | |
| 7.12 | Feature block header | Toggle button | Expands scope, measurements, diagrams | Owner, Crew | | |
| 7.13 | Materials "Log usage" (usage enabled, tracked lines) | Button + dialog | Qty + note → Log | Owner, Crew | | |
| 7.14 | Upcoming deliveries | Display | Supplier · date | Owner, Crew | | |
| 7.15 | Photo thumbnail | Button | Zoom dialog | Owner, Crew | | |
| 7.16 | No prices anywhere | Rule | Built from the crew-safe payload only | Owner, Crew | | |

### 8. `/projects/:id/client-view` — Client view (read-only preview)

`src/components/views/ClientViewPage.tsx` + `src/components/client-hub/*`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 8.1 | "Back to project" | Link | `/projects/:id` | Owner | | |
| 8.2 | Info banner + business logo / name + project name | Display | Client-safe payload | Owner | | |
| 8.3 | Schedule updates card | Display | Posted schedule changes | Owner | | |
| 8.4 | Progress section: photo tiles | Buttons | Zoom; like / comment disabled (`interactive=false`) | Owner | | |
| 8.5 | Care section: Request service / opt-out | Button / checkbox (disabled) | Preview only | Owner | | |
| 8.6 | Review card | Display | As the client sees it | Owner | | |
| 8.7 | Money blocks: invoice link / "#pay" link | Links | `/projects/:id/client-view/documents/invoice/:id` | Owner | | |
| 8.8 | Approved selections: quote link | Link | Document preview | Owner | | |
| 8.9 | History timeline: order toggle, row links / external links, expand | Buttons + links | Newest / oldest; open documents | Owner | | |
| 8.10 | "Download project summary" | Button | Same PDF as the Hub | Owner | | |
| 8.11 | Loading / error | State | Spinner / "Couldn't load the client view" | Owner | | |

### 9. `/bookings` — Bookings (year view)

`src/components/views/BookingsView.tsx`, `src/components/bookings/{MiniMonth,MonthThumbnail,UnscheduledRail,DaySidePanel,JobDetailCard,BookingsLegend,DayTooltip,JobTooltip}.tsx`, `hooks/use-reschedule-job.tsx`, `App.tsx` (`BacklogRedirect`, `CostPlanRedirect`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 9.1 | `/backlog` (and `?month=`) | Redirect | Replaces the URL with `/bookings` and keeps the query | Owner | | |
| 9.2 | `/projects/:id/cost-plan` | Redirect | → `/projects/:id/materials` | Owner | | |
| 9.3 | Back "Dashboard" (mobile + desktop) | Link | `/dashboard` | Owner | | |
| 9.4 | Previous year / "This year" / Next year | Buttons | Change the year | Owner | | |
| 9.5 | Keyboard ← / → / T / Esc | Shortcuts | Previous / next / this year / close the panel (ignored while typing) | Owner | | |
| 9.6 | Year $ + "N jobs booked in YYYY" | Display | Committed dollars and job count | Owner | | |
| 9.7 | Legend | Display | Scheduled / In progress / Complete swatches | Owner | | |
| 9.8 | `?month=YYYY-MM` | URL param | Opens on that year and scrolls to the month | Owner | | |
| 9.9 | Mobile "Unscheduled N" | Button | Opens the panel with unscheduled jobs | Owner | | |
| 9.10 | Mobile month thumbnail | Button | Opens the month panel | Owner | | |
| 9.11 | Desktop unscheduled rail card | Button (Enter) + drag source | Click opens the job panel; drag onto a day schedules it | Owner | | |
| 9.12 | Desktop mini-month header | Button | Opens the month panel | Owner | | |
| 9.13 | Desktop day cell | Button | Opens the day panel; tooltip lists jobs, weather, readiness | Owner | | |
| 9.14 | Day cell drag (single-job day) | Drag source | Drag the job to another day | Owner | | |
| 9.15 | Day cell drop | Drop target | Moves the job start (keeps its length); toast with Undo | Owner | | |
| 9.16 | Day cell markers | Display | Status dots, weather icon / flag, pre-con readiness dot, today ring | Owner | | |
| 9.17 | Panel (empty day): "Schedule a job here" list row | Button | Schedules that unscheduled job on the day (no end date) | Owner | | |
| 9.18 | JobDetailCard ⋯ | Dropdown menu | Delay job… / Confirm start date… (as 3.19.2–3.19.3) | Owner | | |
| 9.19 | JobDetailCard Start / End date | Date inputs | Reschedule with an Undo toast; end is clamped to ≥ start | Owner | | |
| 9.20 | JobDetailCard heads-up reminder | Buttons | As 3.19.6–3.19.7 | Owner | | |
| 9.21 | JobDetailCard pre-con summary line | Display | Readiness | Owner | | |
| 9.22 | JobDetailCard Crew | Select | Saves the crew | Owner | | |
| 9.23 | JobDetailCard forecast | Tiles/popover | As 3.19.9–3.19.11 | Owner | | |
| 9.24 | "View linked quote →" | Link | `/quotes/:headlineId` | Owner | | |
| 9.25 | "View cost plan →" | Link | First sheet `/projects/:id/materials/:sheetId` | Owner | | |
| 9.26 | "Open project" | Button | `/projects/:id` | Owner | | |
| 9.27 | "Unschedule" | Button | Clears the dates; toast with Undo | Owner | | |
| 9.28 | Toast "Undo" (any reschedule) | Toast action | Restores the previous dates | Owner | | |
| 9.29 | Panel close (×, Esc, overlay) | Sheet | Closes | Owner | | |

### 10. Weather components (shared)

`src/components/weather/ForecastStrip.tsx`, `WeatherDayPopover.tsx`, `AppointmentForecastChip.tsx`, `WeatherIcon.tsx`, `riskStyles.ts`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 10.1 | ProjectForecastStrip | Tile row (scrolls sideways) | Work days in range; amber / red tint and flag on risky days | Owner, Crew | | |
| 10.2 | WeatherDayPopover | Popover | Reasons, rain %, inches, high / low | Owner, Crew | | |
| 10.3 | RainDelayAction ("Rain delay") | Button | Only when the RainDelay provider exists (owners) and the day is risky | Owner | | |
| 10.4 | AppointmentForecastChip (interactive) | Popover button | Scheduled site-visit appointments: rain % · high, risk flag | Owner | | |
| 10.5 | AppointmentForecastChip (non-interactive) | Chip with title tooltip | Inside other buttons (dashboard) | Owner | | |
| 10.6 | ForecastNote states | State | No address / geocode failed / unsupported (non-US) / unavailable | Owner, Crew | | |

---

### Code observations (unverified)

All of these come from reading the code. None has been checked in a running app. Line numbers are as of `281bf8b`.

#### Bugs / likely broken

- **UNVERIFIED — Reconcile dialog skips lines left on the default.** `ProjectDetailView.tsx:1650` has `if (!choice) continue;`, but the UI shows "Kept in stock" preselected for every line (`:1691`). Saving without touching a line writes nothing for it, so the "Reconcile materials" banner never clears for those lines.
- **UNVERIFIED — Usage history dates show "Invalid Date".** `UsageLogHistoryDialog.tsx:133` builds ``new Date(`${log.logged_at}T00:00:00`)``, but `logged_at` is a full ISO timestamp (`LogUsageDialog.tsx:61`, `appointmentTime.ts:39`). The result is a string like `…Z T00:00:00`.
- **UNVERIFIED — Post update sheet resets while open.** `PostUpdateSheet.tsx:74-81` resets photos and note whenever `features` changes. `ProgressUpdatesCard.tsx:55` builds `features` as a new array on every render, so any parent re-render (a query refetch, window-focus refetch) can wipe picked photos and the note mid-post.
- **UNVERIFIED — Before & after feature is fixed at mount.** `ProgressUpdatesCard.tsx:281` sets `featureId` once with `useState(features[0]?.id)`. Features load async, so it stays `null`: no feature button shows as selected, and before/after roles get saved with `ba_feature_id = null`.
- **UNVERIFIED — Estimated duration saves on every keystroke.** `ProjectDetailView.tsx:1086` saves on each keystroke. Clearing the field to retype sets `null`, which swaps the UI to the "No estimate set / Add" state and drops focus.
- **UNVERIFIED — Actual start fires the start guard repeatedly.** `ProjectDetailView.tsx:1110` saves the actual start on each date-input change, and runs the start guard each time while the field is still null (typing the year segment fires several changes).
- **UNVERIFIED — Some client photos never load their thumbnails.** `PhotoGallery.tsx:104` keys signed URLs on the ids of *accepted* images only, while `paths` also includes pending client photos. A new client upload doesn't change the key, so its thumbnail can spin until `staleTime` (30 min) runs out.
- **UNVERIFIED — Failed photo upload after an order is saved causes a duplicate.** `ProjectMaterialOrdersView.tsx:164-190` creates the order, then uploads staged photos in the same mutation. If a photo fails, the order already exists, the form isn't reset and an error toast shows. Retrying creates a duplicate order.
- **UNVERIFIED — Labor date defaults to the UTC date.** `ProjectLaborView.tsx:74` uses `new Date().toISOString().slice(0,10)`. In the evening in US time zones that's tomorrow's date.
- **UNVERIFIED — Lost opportunities hide projects everywhere.** `api.ts:193` `isPreSaleProject` is `some(o => o.stage !== "won")`, which also matches `lost`. A project whose opportunity is Lost is hidden from `listProjects`, so the Projects "Archived" (lost) tab likely never shows opportunity-backed lost jobs. The project page's pre-sale banner (`ProjectDetailView.tsx:612-624`) also tells a Lost job "This job hasn't been won yet."
- **UNVERIFIED — Crew select contains a raw link.** `CrewSelect.tsx:25` puts a plain `<Link>` inside Radix `SelectContent`. It isn't keyboard-reachable, and clicking it may not close the select cleanly.

#### Money / quantity math

- **UNVERIFIED — Zero or negative labor hours can be logged.** `ProjectLaborView.tsx:343-345` only checks for NaN. The typed cost has `min=0` in the UI only.
- **UNVERIFIED — Negative, zero or blank-amount expenses.** `ProjectExpensesView.tsx:103` uses `parseFloat(amount) || 0` with no `min`, so negative or zero expenses save. Split lines (`ExpenseSplitDialog.tsx:111-114`) also accept negatives.
- **UNVERIFIED — Unbalanced splits can be saved.** `ExpenseSplitDialog.tsx:239` offers "Save anyway". Category and feature line totals then won't equal the expense amount, and Profit summary / Planned vs actual by type can disagree with the expense total.
- **UNVERIFIED — Zero-quantity edit and no cancel in usage history.** `UsageLogHistoryDialog.tsx:120` saves `parseFloat(qtyStr) || 0`, so a blank or garbage edit sets quantity to 0. There's no Cancel while editing.
- **UNVERIFIED — Order lines with no quantity.** `ProjectMaterialOrdersView.tsx:181` saves `parseFloat(quantity) || 0`. A line with a description but no quantity is saved as qty 0 and still matches and counts.
- **UNVERIFIED — Price field writes on every blur.** `ProjectMaterialOrdersView.tsx:681` saves "Actual $/unit" on every blur, even when nothing changed. Each blur is an extra write plus an invalidation.
- **UNVERIFIED — Bookings drag ignores weekends.** `BookingsView.tsx:161` keeps a job's length in calendar days when it's dragged. The rest of the schedule (rain delay, working days) uses working days, so a moved job can end on a weekend.
- **UNVERIFIED — Negative labor variance has no "−" sign.** `ProjectLaborView.tsx:470-473` only adds "+" when over. Under-plan relies on `formatCurrency` for the minus, and `toFixed(0)` hours shows "-3 hr" with an ASCII hyphen, unlike the "−" used elsewhere.
- **UNVERIFIED — Reconcile credit is never capped.** `ProjectDetailView.tsx:1647` doesn't cap `return_credit` against the line's cost, so a credit can make actual material cost negative.

#### Stale data / missing refresh

- **UNVERIFIED — No error handling on several writes.** `JobDetailCard.tsx:48` (crew change), `HeadsUpReminder.tsx:20` (dismiss), `ProgressUpdatesCard.tsx:163` (edit note), `:214` (reply), and `LetClientKnowDialog` `done()` / `ReachOutDialog` `markSent` (`MaintenanceCard.tsx:322`) have no `onError` or try/catch. Failures are silent or become unhandled rejections.
- **UNVERIFIED — Expense and labor deletes leave no activity trail.** Neither logs a project event (`ProjectExpensesView.tsx:148`, `ProjectLaborView.tsx:142`), unlike add, so Activity only shows additions.
- **UNVERIFIED — Reach-out message can be overwritten while typing.** `MaintenanceCard.tsx:308-320` reseeds the message whenever `project` or `profile` change identity (a refetch), overwriting edits.
- **UNVERIFIED — Reminder picks reset on refetch.** `MaintenanceSetupSheet.tsx:49-53` resets picks whenever `proposed` changes, which is a memo over live queries. A background refetch can re-tick unticked suggestions.
- **UNVERIFIED — Concurrent crew-photo uploads can drop photos.** `CrewWorkOrderCard.tsx:48` appends to the `photos` captured at mutation start, so two quick uploads can drop one set. Removing a photo (`:90`) doesn't delete the stored file.

#### Dead ends / missing controls

- **UNVERIFIED — Saved orders can't be edited.** A saved material order's supplier, date, notes, quantities and descriptions can't be changed, and lines can't be added (`ProjectMaterialOrdersView.tsx` `MaterialOrderCard`). The only options are delete and re-create.
- **UNVERIFIED — Expense name and amount can't be edited after saving.** Only category, date, feature and type are editable (`ProjectExpensesView.tsx` `ExpenseRow`).
- **UNVERIFIED — Receipt scan isn't on the Expenses page.** It's only on Material orders (`ProjectMaterialOrdersView.tsx:117`), and a scanned PDF receipt isn't attached (`:147`).
- **UNVERIFIED — No way to close some add rows and dialogs.** The Pre-con "Add item" row has no cancel and Enter doesn't submit (`PreconCard.tsx:293-304`). AddNewWorkDialog has no Cancel and keeps picks after closing (`AddNewWorkDialog.tsx:41-42`).
- **UNVERIFIED — Destructive actions with no confirm.** Delete photo / reject client photo (`PhotoGallery.tsx:238,395`), delete progress update (`ProgressUpdatesCard.tsx:119`), delete field update (`ProjectDetailView.tsx:1961`), pre-con "Remove from this job" (`PreconItemSheet.tsx:258`), maintenance "Stop reminders" and status → Lost all act at once.
- **UNVERIFIED — A busy day can't take another job.** The Bookings day panel only offers "Schedule a job here" on an *empty* day (`DaySidePanel.tsx:48`); a day that already has a job can't get another unscheduled job from the panel.
- **UNVERIFIED — "Change the job" shows on Complete jobs.** `isProjectActive` is true for Complete (`materialTracking.ts:50`), so the card (`ProjectDetailView.tsx:761`) appears on finished jobs even though the comment says "Won / in progress".

#### Loading / empty / error states

- **UNVERIFIED — Several pages have no loading or error state.** `ProjectLaborView` has none for the project (the header renders blank). `PlannedVsActualCard` and `CloseoutPanel` return `null` while loading, so the card pops in late. `MaintenanceCard` returns `null` until fetched.
- **UNVERIFIED — Activity list is unbounded.** `ProjectDetailView.tsx:1274` renders every event with no cap or "See more". That's a long right rail on busy jobs, especially on phones.
- **UNVERIFIED — Messages card shows on jobs with no client.** `ProjectDetailView.tsx:1298` renders it even when `client_id` is null, so messages can be sent that no client can read.

#### Mobile risks

- **UNVERIFIED — Nested buttons in the gallery.** `PhotoGallery.tsx:279` puts an interactive `span role=button` inside a `<button>`. That's invalid nesting, and taps on the small eye icon can open the lightbox instead.
- **UNVERIFIED — Every date field saves on change.** Schedule dates, actual dates, expense row dates and JobDetailCard dates all save per change. With mobile date pickers that's usually one change, but with desktop segmented typing it's several writes, several reschedule toasts, and several heads-up triggers (`JobDetailCard.tsx:73,83`, `ProjectExpensesView.tsx:339`).
- **UNVERIFIED — Year shortcuts can fire while menus are open.** The Bookings keyboard handler (`BookingsView.tsx:133-139`) ignores inputs and textareas but not `select` or open Radix menus, so arrow keys inside a panel select can also change the year.

#### Permission / data exposure

- **UNVERIFIED — Offline work-order copy stays on the owner's device.** `WorkOrderView` saves the offline copy to device storage on the owner's preview too (`saveOfflineWorkOrder`), which includes client name, phone and address. It's a leftover on shared devices, not a leak to employees (owner routes redirect employees).
- **UNVERIFIED — Preview isn't exactly what the crew sees.** The work-order preview (`WorkOrderPage.tsx:28`) says "exactly what your crew sees", but it hides the crew-only "Post update" and "Reviewed" controls.

#### Naming inconsistencies

- **UNVERIFIED — "Lost" is labelled "Archived".** The Projects filter says "Archived" (`ProjectsView.tsx:75`) while the status select, pills and legend say "Lost".
- **UNVERIFIED — Project count and "All" count disagree.** The header counts every project, including Estimating and Lost (`ProjectsView.tsx:89,109`), while "All" counts only real jobs.
- **UNVERIFIED — Demo columns sit beside live data.** Stage, Progress, Next and "weeks booked out" are demo data (`ProjectsView.tsx:109,164,201`). The mobile card eyebrow uses the demo stage, not the real status.
- **UNVERIFIED — "Cost plan" is served from `/materials`.** The label is "Cost plan" but the route is `/materials` (hub card, alerts, labor link), and `/cost-plan` only redirects.
- **UNVERIFIED — "Costs to date" is expenses only.** That card (`ProjectDetailView.tsx:859`) leaves out labor, while the Profit summary's "Actual cost" includes labor, so the two numbers disagree on the same page.
- **UNVERIFIED — One date field, two meanings.** The material-order "Delivery date" is stored in `expected_delivery_date`, which means expected or actual depending on status.

---

## Area 04 — Cost plan & calculators

This is a code-read inventory from 2026-09-28. Nothing was click-tested, and no numbers were run against the live app. The figures in section 23 come from running the same JS expressions in Node.

**Role:** every route below is owner-only. `AppLayout.tsx:93` sends any `employee` login to `/employee` before an owner route renders, so the Role column says **Owner** throughout.
**State:** Status and Note are left blank for the tester. When an item only shows up in some states, the state is written in the "What it should do" column. "Tracking on" means `isProjectActive(project)` is true: the job is Won and scheduled, in progress or complete (`materialTracking.ts:63`).
**Draft model:** every edit on the Cost plan is a local draft. Nothing is written until **Save changes** on the DraftSaveBar. The exceptions are called out in the rows (overhead-warning dismiss, calculator inputs, Revise estimate, Log usage, Mark ordered).
**Quick Quote per section:** this is **not present in the Cost plan**. `ProjectMaterialsView.tsx` doesn't import it, and it only lives in the quote builder. Its math is still inventoried in section 22 because Settings › Quick Quote Rates feeds it.

---

### 1. Cost plan page shell: `/projects/:id/materials`
`src/components/views/ProjectMaterialsView.tsx` (`ProjectMaterialsView` L456, `MaterialsSheetBuilder` L504)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CP-1 | "Back to project" | Link (BackLink) | Goes to `/projects/:id`. Asks first if there are unsaved changes (app-wide guard) | Owner | | |
| CP-2 | Title "Cost plan" + project name | Display | Shows the project name under the title | Owner | | |
| CP-3 | Go to project link | Link | `GoToProjectLink`, which is aware of `isDirty` | Owner | | |
| CP-4 | "Generate Order Sheet" | Button | Only shown once a plan exists (`sheetId`). Disabled when no counted section has material lines. Opens the Order Sheet dialog (section 12) | Owner | | |
| CP-5 | Estimated / Actual to date / Variance card | Display | Only when tracking is on and there's at least one counted material line. Variance shows "+$X (+N%)" and is amber when over | Owner | | |
| CP-6 | "N unplanned items" badge | Display | Shows when deliveries exist that aren't matched to a line | Owner | | |
| CP-7 | Planned vs actual card | Card | Only when tracking is on. `PlannedVsActualCard` (context and closeout hidden) | Owner | | |
| CP-8 | Material alerts bar | Bar | See section 13. Hidden when there are no alerts or it's snoozed | Owner | | |
| CP-9 | "Tracking X of Y materials" | Display | Only when tracking is on and there are material lines. Counts live from the draft | Owner | | |
| CP-10 | "Manage tracking" | Popover trigger | Opens a popover with Track all / Track none | Owner | | |
| CP-11 | Track all / Track none | Buttons | Sets `tracked` on every material line in the draft, so Save is required | Owner | | |
| CP-12 | Loading / error / "Add a section to get started." | Display | Load states. The empty state shows only when the draft is empty | Owner | | |
| CP-13 | Collapse all / Expand all | Links | Collapses or expands every section. The state is kept in localStorage via `useSectionCollapse` | Owner | | |
| CP-14 | Section list drag (feature sections) | Drag and drop | Reorders non-General sections. General stays pinned last and can't be dragged | Owner | | |
| CP-15 | Unplanned materials card | Card | Only when tracking is on and there are unmatched deliveries. See section 11 | Owner | | |
| CP-16 | "+ Add blank section" | Button | Adds an empty draft section and auto-opens its name/feature picker | Owner | | |
| CP-17 | "Create Smart Section" | Button | Opens "What are you building?" (section 8) | Owner | | |
| CP-18 | Total cost card ("Total cost · N sections") | Display | Shows the plan total plus a Materials / Labor / Subcontractors / Equipment / Other breakdown. Proposed and removed features' sections are left out of the total | Owner | | |
| CP-19 | True cost · internal | Display | `TrueCostSummary`: direct cost, overhead burden, break-even, quote price, expected / fully loaded profit, price for target, labor sell rate. Shows the "Set up overhead" link when there's no rate | Owner | | |
| CP-20 | True cost rate note | Display | Shows which rate is in use: the project's stored rate, the quote's stored rate, or current settings | Owner | | |
| CP-21 | "Set up overhead to see true profit →" | Link | Only when no overhead rate is known. Goes to `/settings/overhead` | Owner | | |
| CP-22 | DraftSaveBar: Discard | Button | Throws the draft away and reseeds from the server. On a brand-new plan this leaves just General | Owner | | |
| CP-23 | DraftSaveBar: Save changes | Button | Runs the whole diff: creates the plan if needed → creates "new feature" features → deletes sections → creates/updates sections, labor and items → upserts remembered prices. Toast "Cost plan saved" | Owner | | |
| CP-24 | New plan prefill | Auto | No plan yet → the draft opens with one section per live feature (or per project type before 0105), including template lines and the labor default. It stays unsaved until Save | Owner | | |
| CP-25 | Auto feature sections | Auto | While the plan isn't dirty, a feature with no section gets one written right away (`ensureFeatureSections`) | Owner | | |
| CP-26 | Deep links `#line-<id>` / `#section-<id>` | Hash handling | Expands the section, scrolls to it and flashes the row for 2.4 s (used by the alert links) | Owner | | |
| CP-27 | Leave with unsaved edits | Guard | The app-wide unsaved-changes prompt should fire | Owner | | |

### 2. Section card (feature section + General)
`MaterialsSectionCard` `ProjectMaterialsView.tsx:1783`, wrapper `common/SectionCard.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| SC-1 | Section name field (click to edit) | Input + feature picker | Renames the section. Opens a combobox of features / "new <type>" / types (`SectionNameField`). Picking one sets name + type (+ feature). Read-only on General | Owner | | |
| SC-2 | Name commit (blur/Enter) | Auto | An untyped section whose typed name matches a feature gets that type (`withCommittedSectionName`) | Owner | | |
| SC-3 | Collapse / expand chevron | Button | Toggles the section. When collapsed, the header shows the cost breakdown and item names | Owner | | |
| SC-4 | Auto-expand while dragging a line over a collapsed section | Auto | Expands on hover during an item drag | Owner | | |
| SC-5 | Section drag handle | Drag | Not shown on General | Owner | | |
| SC-6 | Section ↑ / ↓ arrows | Buttons | Disabled at the ends and on General | Owner | | |
| SC-7 | Header subtotal | Display | Every line type plus labor for the section. Counted even when the section is proposed or removed | Owner | | |
| SC-8 | Type tag (no feature) | SectionTypeChip (popover / sheet on mobile) | Pick a project type or "none". When the name is still autofilled, it follows the type | Owner | | |
| SC-9 | Type pill (feature section) | Display | The feature's type, fixed | Owner | | |
| SC-10 | "Proposed · not counted yet" / "Add-on quote #N" pill | Display | Shows for a proposed add-on feature | Owner | | |
| SC-11 | "CO #N pending" pill | Display | Shows for pending change orders on the feature | Owner | | |
| SC-12 | "Removed from project · not counted" pill | Display | Shows for a removed feature | Owner | | |
| SC-13 | General tag text | Display | "Project-wide costs — dumpster, permits, mobilization…" | Owner | | |
| SC-14 | "Calculate quantities" | Toolbar button | Only for Smart Section build types. Opens the calculator (section 9) | Owner | | |
| SC-15 | "View history" | Toolbar button | Only for feature sections. Opens Feature history (section 14) | Owner | | |
| SC-16 | "Fill quantities" (measurements badge) | Toolbar button | Shows when site measurements exist for the build type and **every** line's qty is 0. Opens the calculator prefilled | Owner | | |
| SC-17 | Sort select: Manual order / Cost high→low / Cost low→high | Select | Only when there's more than 1 line. View-only, sorting within each type group. Reordering while sorted turns the sorted order into the manual order | Owner | | |
| SC-18 | "Delete section" | Button → AlertDialog | Not on General. The confirm text shows the line count, labor and total. For a feature section it also warns that the feature will be taken off the project | Owner | | |
| SC-19 | Delete confirm: Cancel / Remove | AlertDialog buttons | Remove deletes from the draft only. Save deletes the rows and marks the feature `removed` | Owner | | |
| SC-20 | Type group headings (Materials / Subcontractors / Equipment / Other) | Display | Only when more than one type is present | Owner | | |
| SC-21 | Line drag (within and between sections) | Drag and drop | Moves a line. Lines are always re-grouped by type after the drop | Owner | | |
| SC-22 | "+ Material" | Split button (main) | Adds a blank material line (qty 0, tracked) | Owner | | |
| SC-23 | ▾ (add another kind) | Popover (desktop) / bottom sheet (mobile) | + Subcontractor / + Equipment / + Other. New lines start as a 1 × $0 lump sum | Owner | | |
| SC-24 | "This looks like overhead…" banner + Dismiss | Banner + button | Shows when overhead is set up and the line name matches the overhead words. Dismiss is written straight away and isn't part of Save | Owner | | |
| SC-25 | Estimating insight (labor) | Hint + "Apply ×N to this block" | Shows similar-job labor ratios. Apply scales days / man-hours / lump sum by the adjustment factor | Owner | | |
| SC-26 | Pending CO overlay box | Display | Shows "Pending CO #N", ± delta and the change lines. Not in totals | Owner | | |
| SC-27 | Feature report strip | Display | Only when tracking is on and the feature is active (or General). Planned vs actual for the feature | Owner | | |

### 3. Material line row
`ItemRow` `ProjectMaterialsView.tsx:2088`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| ML-1 | Item name | AutoGrowTextarea | Edits the name. The calculator matches lines by exact name | Owner | | |
| ML-2 | Color | OptionOrCustomField (select + "Other color…" text) | Only when the line is linked to a Catalog product. Uses the product's color list, or a typed custom color | Owner | | |
| ML-3 | "Price Book" | Button | Opens the material picker (section 7). Highlighted when the line is linked | Owner | | |
| ML-4 | Tracked / Not tracked | Toggle button | Only when tracking is on. Flips `tracked` in the draft | Owner | | |
| ML-5 | Drag handle | Drag | Reorders the line (keyboard arrows supported) | Owner | | |
| ML-6 | ↑ / ↓ | Buttons | Moves the line one spot | Owner | | |
| ML-7 | Remove item (trash) | Button | Removes from the draft right away, with no confirm | Owner | | |
| ML-8 | Category | Select | "Uncategorized" + Settings › Material categories. Groups the Order Sheet | Owner | | |
| ML-9 | Qty | Number input | `parseFloat` or 0 | Owner | | |
| ML-10 | Unit | OptionOrCustomField | sq ft / piece / layer / pallet / ton / bag / roll / tube or a custom text value. The list icon returns to the dropdown | Owner | | |
| ML-11 | Waste % | Number input | `parseFloat` or 0 | Owner | | |
| ML-12 | Unit cost | Number input (step 0.01) | `parseFloat` or 0 | Owner | | |
| ML-13 | "Remember this price for next time" | Checkbox | Only for Catalog lines. On Save, upserts `catalog_price_overrides` | Owner | | |
| ML-14 | Total | Display | qty × (1 + waste%) × unit cost | Owner | | |
| ML-15 | Waste math hint | Display | Shows "Q unit + W% waste = Q′ unit" when both are > 0 | Owner | | |
| ML-16 | "Next full package: N · Use N" | Hint + button | Only for Catalog lines with package specs when the waste-adjusted qty isn't already a whole package. "Use N" sets waste % so Q′ = N and leaves qty alone | Owner | | |
| ML-17 | Tracking row | Panel | See section 6. Only for saved lines that are tracked while tracking is on | Owner | | |

### 4. Non-material cost line (Subcontractor / Equipment / Other)
`src/components/materials/CostLineRow.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| NL-1 | Type tag | Display | Subcontractor / Equipment / Other, colored | Owner | | |
| NL-2 | Drag handle / ↑ / ↓ | Drag + buttons | Reorders within the type group | Owner | | |
| NL-3 | Remove line | Button | Removes from the draft, with no confirm | Owner | | |
| NL-4 | Description | AutoGrowTextarea | The placeholder depends on the type | Owner | | |
| NL-5 | Sub / Vendor | SupplierCombobox | Pick or add a supplier (optional) | Owner | | |
| NL-6 | Lump sum / Qty × rate | Segmented radio | Lump sets unit to "lump sum", qty to 1 and amount to the current total. Qty × rate clears the unit | Owner | | |
| NL-7 | Amount ($) | Number input | Lump mode. Sets unit_cost and forces qty to 1 | Owner | | |
| NL-8 | Qty / Unit / Rate ($) | Inputs | Qty × rate mode | Owner | | |
| NL-9 | Total | Display | qty × rate (no waste) | Owner | | |

### 5. Labor block (per section)
`src/components/materials/SectionLaborBlock.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| LB-1 | "+ Add labor" | Button | Shows when there's no labor. Starts Crew mode at 8 h/day and the default labor rate (Business profile, else $45) | Owner | | |
| LB-2 | Crew × days / Man-hours / Lump sum | Segmented radio | Switches mode. Lump prefills the current cost. Man-hours prefills the current hours | Owner | | |
| LB-3 | Labor $ total | Display | `sectionLaborCost` | Owner | | |
| LB-4 | Remove labor (×) | Button | Clears every labor field, with no confirm | Owner | | |
| LB-5 | Crew size / Days / Hours / day / Rate / person | Text inputs (decimal) | Crew mode. A blank field is null | Owner | | |
| LB-6 | Man-hours / Rate / hour | Inputs | Hours mode | Owner | | |
| LB-7 | Labor total / Man-hours (for overhead) | Inputs | Lump mode | Owner | | |
| LB-8 | Formula line | Display | e.g. "3 guys × 4 days × 8 hrs × $30 = $2,880" | Owner | | |
| LB-9 | Labor notes | AutoGrowTextarea | Optional | Owner | | |

### 6. Material tracking row + tracking dialogs
`MaterialTrackingRow` `ProjectMaterialsView.tsx:2430`, Revise dialog L1608, `LogUsageDialog.tsx`, `UsageLogHistoryDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| TR-1 | "Est. X · Ordered · Delivered · Used" | Display | Est. = live qty × (1 + waste), or the revised qty × (1 + waste) | Owner | | |
| TR-2 | Status chip | Display | Not ordered / Ordered / Delivered / In use / Used up / Over estimate | Owner | | |
| TR-3 | Progress bar | Display | Delivered and used as a share of max(est, ordered, delivered, used, 1) | Owner | | |
| TR-4 | "N over the X estimate" | Display | Only when over estimate | Owner | | |
| TR-5 | "Log usage" | Button | Opens Log usage | Owner | | |
| TR-6 | "Mark fully used" | Button | Only when delivered > used. Writes a usage log for delivered − used right away | Owner | | |
| TR-7 | "Revise estimate" | Button | Opens the Revise estimate dialog | Owner | | |
| TR-8 | "View usage log" | Button | Only when used > 0. Opens usage history | Owner | | |
| TR-9 | Revise dialog: "Why is this changing?" | Textarea | Required | Owner | | |
| TR-10 | Revise dialog: "Save new baseline" | Button | Disabled until there's a reason. Writes a baseline straight away (`reviseMaterialBaseline`) | Owner | | |
| TR-11 | Log usage: Quantity | Input (decimal) | Must be > 0 | Owner | | |
| TR-12 | Log usage: Date | Date input | Clearing it falls back to today | Owner | | |
| TR-13 | Log usage: Note / Logged by | Inputs | Optional | Owner | | |
| TR-14 | Log usage: photo add / remove | File input + button | Attaches or removes a photo | Owner | | |
| TR-15 | Log usage: Save | Button | Disabled until qty > 0 | Owner | | |
| TR-16 | Usage history: Edit (pencil) → qty + Save | Button + input | Edits the entry and keeps an event in the history. `parseFloat` or 0 | Owner | | |
| TR-17 | Usage history: Delete → confirm | Button + AlertDialog | Deletes the entry and keeps an event in the history | Owner | | |

### 7. Material picker dialog ("Pick a material")
`MaterialPickerDialog` `ProjectMaterialsView.tsx:2494`, `CatalogPicker.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| MP-1 | Price Book / Catalog | Tabs | Switches the source | Owner | | |
| MP-2 | "Search your saved materials…" | Input | Filters Price Book by name. Hidden when the Price Book is empty | Owner | | |
| MP-3 | Price Book row | Button | Sets name, unit, unit price, cost category, material category and `price_book_item_id`, and unlinks any Catalog product | Owner | | |
| MP-4 | Empty Price Book text | Display | Points to Settings → Price Book | Owner | | |
| MP-5 | "Search catalog by name or SKU…" | Input | Searches the whole catalog, restricted to the question's category inside the calculator | Owner | | |
| MP-6 | Brand list (Techo-Bloc, Belgard, Keystone, Unilock, Cambridge Pavers) | Buttons | Drills into the brand's categories | Owner | | |
| MP-7 | Category list / "‹ Brand" back | Buttons | Drills into products / goes back | Owner | | |
| MP-8 | Product row / "‹ Category" back | Buttons | Picking a product sets name, unit, color (kept only when it's the same product), unit cost (remembered price, else 0) and material category | Owner | | |
| MP-9 | "No {brand} products yet" | Display | Empty brand | Owner | | |

### 8. "What are you building?" (Smart Section picker)
`src/components/materials/SmartSectionDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| SS-1 | Build type row (11: Paver Patio, Outdoor Kitchen, Seating Wall, Fire Pit, Fireplace, Outdoor Lighting, Pergola, Water Feature, Sod, Irrigation, Plants) | Button | Adds a draft section named after the type with the contractor's template lines (blank qty/price, add-on lines left out) and the labor default. Auto-tags the matching project type | Owner | | |
| SS-2 | Gear icon per row | Button | Opens the template editor (section 10) for that type | Owner | | |

### 9. Smart Section calculator dialog
`src/components/materials/SmartSectionCalculatorDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CA-1 | "From site measurements" picker | Select | Only when measurements exist. Picks one instance or "All N combined" and prefills the size questions (and courses from height) | Owner | | |
| CA-2 | Area question: "Square footage" / "Length × width" | Toggle chips | Switches the input mode | Owner | | |
| CA-3 | Area: sq ft input | Number input | When no measured perimeter is known, perimeter ≈ 4√A | Owner | | |
| CA-4 | Area: Length (ft) / Width (ft) | Number inputs | area = L×W, perimeter = 2(L+W) | Owner | | |
| CA-5 | "= N sq ft · perimeter ≈ P ft (estimated / from site measurements)" | Display | Readout | Owner | | |
| CA-6 | Number questions (per template, with unit suffix) | Number input | `parseFloat` or 0. Questions backed by a tunable are seeded from Settings | Owner | | |
| CA-7 | Toggle questions (include border / include fire ring) | Checkbox | Shows or hides dependent questions | Owner | | |
| CA-8 | Select question (kitchen countertop: Pick from Catalog / Sourcing separately) | Select | Sourcing separately leaves the countertop line untouched | Owner | | |
| CA-9 | Catalog product question ("Pick from Catalog…" / Change) | Button → picker dialog | Opens `CatalogPicker`, restricted by category | Owner | | |
| CA-10 | Base insight (under Base depth) | Hint | Similar jobs' tons/sq ft compared with the default | Owner | | |
| CA-11 | "Use your adjustments for this job" | Checkbox | Only when Estimating-insight slot adjustments apply. Multiplies the quantities | Owner | | |
| CA-12 | "Calculate quantities" | Button | Writes qty and unit (and catalog link, remembered price, category) into the lines with matching names, adds measured add-on lines, closes, and marks the draft dirty. The inputs are saved to `smart_inputs` straight away (saved sections only) | Owner | | |

### 10. Smart Section template editor
`src/components/materials/SmartSectionTemplateEditorDialog.tsx` (opened from section 8's gear and from Settings › Smart Section Templates)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| TE-1 | Line item name | Input | Renames the line for future sections. A blank name is dropped on Save | Owner | | |
| TE-2 | Line type | Select (custom lines only) / fixed "Material" (slot lines) | Material / Subcontractor / Equipment / Other | Owner | | |
| TE-3 | ↑ / ↓ | Buttons | Reorders | Owner | | |
| TE-4 | Remove item | Button | Removes the line. The calculator then skips that slot | Owner | | |
| TE-5 | "+ Add line item" | Button | Adds a name-only line | Owner | | |
| TE-6 | Labor default: Crew size / Days | Number inputs | Prefills new sections' labor (8 h/day at the default rate). Both blank means no labor | Owner | | |
| TE-7 | Calculator defaults (grouped by line) | Number inputs with unit | Each tunable. `parseFloat` or 0 | Owner | | |
| TE-8 | "Reset to default" → confirm | Button + AlertDialog | Deletes the override row | Owner | | |
| TE-9 | "Save template" | Button | Upserts the settings and closes | Owner | | |

### 11. Unplanned materials card
`UnplannedMaterialsCard` `ProjectMaterialsView.tsx:1644`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| UP-1 | Unplanned row (qty, unit, description, $/unit) | Display | Each delivery line that isn't matched to a line | Owner | | |
| UP-2 | "Match to a sheet line…" | MaterialsLinePicker | Matches the delivery line straight away | Owner | | |

### 12. Order Sheet dialog + Email to supplier
`src/components/materials/OrderSheetDialog.tsx`, `EmailOrderSheetStep.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| OS-1 | Category chips (select all in category) | Toggle chips | Only when there's more than 1 category. Selects or unselects every line in the category | Owner | | |
| OS-2 | Line checkbox (name, qty, unit) | Checkbox | Only counted material lines are listed. Qty shown is the raw qty (no waste) | Owner | | |
| OS-3 | Project / job name | Input | Defaults to the project name | Owner | | |
| OS-4 | Delivery address | Textarea | Defaults to the project address | Owner | | |
| OS-5 | Supplier (optional) | SupplierCombobox | Pick or add a supplier | Owner | | |
| OS-6 | Date needed (optional) | Date input | Used as the order's expected delivery date | Owner | | |
| OS-7 | Notes (optional) | Textarea | Printed on the sheet | Owner | | |
| OS-8 | "N items selected" | Display | Counter | Owner | | |
| OS-9 | "Email to supplier" | Button | Disabled when nothing is selected. Builds the PDF → Email step | Owner | | |
| OS-10 | "Generate" | Button | Downloads the PDF (qty = waste-adjusted and rounded to whole packages, lines combined by product+color+unit, grouped by category) → confirm step | Owner | | |
| OS-11 | Email: "Open full size" | Link | Opens the PDF blob in a new tab | Owner | | |
| OS-12 | Email: PDF preview | iframe | Preview | Owner | | |
| OS-13 | Email: Supplier | SupplierCombobox | Picking a supplier fills To with their email unless To was hand-edited | Owner | | |
| OS-14 | Email: To / Subject / Message | Inputs | To must pass the email regex. Subject is required | Owner | | |
| OS-15 | Email: "Back" | Button | Returns to the select step | Owner | | |
| OS-16 | Email: "Send with PDF" | Button | Sends via the `send-supplier-email` edge function, saves a typed email onto a supplier that had none, logs a project event → confirm step | Owner | | |
| OS-17 | Confirm: line list (title, qty, unit) | Display | The per-line order quantities | Owner | | |
| OS-18 | Confirm: "Not now" | Button | Closes without an order | Owner | | |
| OS-19 | Confirm: "Yes, mark as ordered" | Button | Creates a `material_orders` row with one item per line (unit via `guessMaterialOrderUnit`) and bumps supplier usage | Owner | | |
| OS-20 | Close (X / outside click) | Dialog | Resets every field | Owner | | |

### 13. Material alerts bar
`src/components/materials/MaterialAlertsBar.tsx` (shared with the project page)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| AL-1 | Summary bar "⚠ N over estimate · … · job starts in Nd · Review" | Button | Toggles the inline list (desktop) or bottom sheet (mobile) | Owner | | |
| AL-2 | Group header (section name + counts) | Button | Expands or collapses the group's alerts | Owner | | |
| AL-3 | "Open in cost plan" | Link | `#section-<id>` | Owner | | |
| AL-4 | "Mark as ordered" (group) | Button | Only when the group has not-ordered lines. Logs one order (`markLinesOrdered`) straight away | Owner | | |
| AL-5 | Alert line | Link | `#line-<id>`, or `/projects/:id/material-orders` for delivery-overdue alerts | Owner | | |
| AL-6 | "Not needed" | Button | Tracking off for that line. Goes into the draft when it's dirty, otherwise it's written straight away | Owner | | |
| AL-7 | "Snooze 3 days" | Button | Hides the bar for this project (localStorage) | Owner | | |

### 14. Feature history dialog
`src/components/materials/FeatureHistoryDialog.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| FH-1 | Original → CO / add-on events → Current timeline | Display | Price and cost per step, the deltas, and the current margin %. Current cost comes from the draft (all sections, including proposed ones) | Owner | | |
| FH-2 | Close | Dialog | Closes | Owner | | |

### 15. Cost Plans list: `/materials`
`src/components/views/MaterialSheetsView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| CL-1 | Mobile header "Cost Plans" + "N plans · $X total cost" | Display | Rollup | Owner | | |
| CL-2 | Search ("Search sheets or jobs") | SearchInput (mobile + desktop) | Filters by plan name or project name | Owner | | |
| CL-3 | KPI "Sheets" / "Total cost" | KpiCard | Count and the sum of `costPlanTotal` | Owner | | |
| CL-4 | Table row (Sheet, Job, Items, Cost, Created) | Row click | Opens `/projects/:pid/materials/:sheetId` | Owner | | |
| CL-5 | Mobile ListCard | Card click | Same as CL-4 | Owner | | |
| CL-6 | Empty "No cost plans here." / load error | Display | Load states | Owner | | |

### 16. Redirect routes
`src/App.tsx:123`, `:180`, `:184`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| RD-1 | `/projects/:id/cost-plan` | Redirect | Replaces the URL with `/projects/:id/materials` | Owner | | |
| RD-2 | `/projects/:id/materials/:sheetId` | Route | Same builder, pinned to that sheet id | Owner | | |

### 17. Settings › Smart Section Templates: `/settings/smart-sections`
`src/components/views/SettingsSmartSectionsView.tsx`, `src/components/materials/ProjectTypesPanel.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| ST-1 | "Settings" back | Link | Goes to `/settings` | Owner | | |
| ST-2 | Project types: "Reset to default" | Button | Adds missing default types back (it never deletes) | Owner | | |
| ST-3 | Project type name | Input (rename on blur) | Renames the Job Category straight away. A blank name reverts | Owner | | |
| ST-4 | Capability tag ("Measurements · Smart Section · Quick Quote" / "Custom measurements only") | Display | Based on how the name matches a build type | Owner | | |
| ST-5 | Remove type (trash) → confirm | Button + AlertDialog | Deletes the category. Things that used it become uncategorized | Owner | | |
| ST-6 | "New project type" + Add / Enter | Input + button | Creates a category | Owner | | |
| ST-7 | Build type row (11) | Button | Opens the template editor (section 10) | Owner | | |

### 18. Settings › Quick Quote Rates: `/settings/quick-quote-rates`
`src/components/views/SettingsQuickQuoteRatesView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| QR-1 | Rate per build type ($ + unit label) | Number input | Draft. `parseFloat` or 0 on save | Owner | | |
| QR-2 | "Reset" per row | Button | Only when overridden. Returns to the shipped default (draft) | Owner | | |
| QR-3 | "Save changes" | Button | Saves each overridden row and resets the others | Owner | | |
| QR-4 | Unsaved-changes guard | Guard | Asks before leaving | Owner | | |

### 19. Settings › Price Book: `/settings/pricebook`
`src/components/views/SettingsPricebookView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| PB-1 | "Add your first item" / "Add item" | Button | Opens the item dialog | Owner | | |
| PB-2 | Item row | Button | Opens the item dialog for editing | Owner | | |
| PB-3 | Name | Input | Required | Owner | | |
| PB-4 | Unit / Unit price | Inputs | Free text / `parseFloat` or 0 | Owner | | |
| PB-5 | Category (expense category) | Select | Required to save | Owner | | |
| PB-6 | Material type (optional) | Select | "Not calculator-relevant" + types | Owner | | |
| PB-7 | Material category (optional) | Select | Order Sheet grouping | Owner | | |
| PB-8 | Specs: Coverage / pallet, Units / pallet, Length, Width, Thickness, Joint width, Coverage / bag | Number inputs | Only numeric values are saved. Coverage feeds `prefillConversion` | Owner | | |
| PB-9 | Delete → confirm | Button + AlertDialog | Deletes the item | Owner | | |
| PB-10 | Save | Button | Disabled until there's a name and a category | Owner | | |

### 20. Settings › Material categories / Suppliers: `/settings/material-categories`, `/settings/suppliers`
`SettingsMaterialCategoriesView.tsx`, `SettingsSuppliersView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| MC-1 | "New category" + Add / Enter | Input + button | Creates a material category | Owner | | |
| MC-2 | Category ↑ / ↓ | Buttons | Reorders | Owner | | |
| MC-3 | Category name (rename on blur) | Input | Renames. Lines follow it by id | Owner | | |
| MC-4 | Delete category → confirm | Button + AlertDialog | Deletes it. Lines become Uncategorized | Owner | | |
| SU-1 | "New supplier name" + Add / Enter | Input + button | Creates a supplier | Owner | | |
| SU-2 | Supplier name (rename on blur) | Input | Renames | Owner | | |
| SU-3 | Contact info toggle | Button | Expands phone / email / address | Owner | | |
| SU-4 | Phone / Email / Address (save on blur) | Inputs | Saves on blur. Email feeds OS-13 | Owner | | |
| SU-5 | Delete supplier → confirm | Button + AlertDialog | Deletes the supplier | Owner | | |

### 21. Settings › Overhead: `/settings/overhead`
`src/components/views/SettingsOverheadView.tsx`

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| OH-1 | Overhead item label | Input | Draft | Owner | | |
| OH-2 | Amount ($) | Input (decimal) | Blank is null | Owner | | |
| OH-3 | Monthly / Yearly | Segmented radio | The period | Owner | | |
| OH-4 | "$X/yr" per row | Display | `annualAmount` | Owner | | |
| OH-5 | Remove row | Button | Removes the row | Owner | | |
| OH-6 | "+ Add a row" | Button | Adds a blank monthly row | Owner | | |
| OH-7 | Total annual overhead | Display | `annualOverhead` | Owner | | |
| OH-8 | Field workers / Weeks / Days / Hours / Utilization % | Inputs | Helper inputs. The formula line shows the product | Owner | | |
| OH-9 | Crew size | Input | A blank field becomes 3 | Owner | | |
| OH-10 | Or: man-hours / year · Or: crew-days / year | Inputs | Each clears the other. Either one overrides the helper (the helper line gets struck through) | Owner | | |
| OH-11 | Productive capacity readout | Display | Man-hours · crew-days / year | Owner | | |
| OH-12 | Overhead burden readout | Display | $/hr and $/crew-day | Owner | | |
| OH-13 | Show labor in Hours / Crew-days | Segmented radio | `display_unit` | Owner | | |
| OH-14 | Target margin % | Input | Used for the required price and the labor sell rate | Owner | | |
| OH-15 | DraftSaveBar Discard / Save | Buttons | Save drops rows that have no label and no amount | Owner | | |

---

### 22. Calculations

**Units key:** qty = the line's own unit. $ = USD. "sq ft·in/ton" means the formula divides area × depth(in) by the tunable.

| # | Calculation | Formula (as coded) | File:line | Units | Status | Note |
|---|---|---|---|---|---|---|
| K-1 | Waste-adjusted quantity | `(Number(q)\|\|0) * (1 + (Number(w)\|\|0)/100)` | `src/lib/materialsMath.ts:12-14` | qty | | |
| K-2 | Material line total | `quantityWithWaste(q,w) * (Number(unit_cost)\|\|0)` | `materialsMath.ts:17-23` | $ | | |
| K-3 | Waste % to reach a target ("Use N") | `max(0, round((target/q − 1)·10000)/100)`; q ≤ 0 → 0 | `materialsMath.ts:29-32` | % (2 dp) | | |
| K-4 | Display qty | `String(round(n·100)/100)` | `materialsMath.ts:35` | qty | | |
| K-5 | Sort lines by cost | stable sort by `materialsLineTotal`, desc/asc, within each type group | `materialsMath.ts:105-115`, `ProjectMaterialsView.tsx:380-381` | — | | |
| K-6 | Unit normalization (dropdown) | synonym map → sq ft/piece/layer/pallet/ton/bag/roll/tube, else unchanged | `materialsMath.ts:53-89` | — | | |
| K-7 | Package coverage | `coverage_per_unit × units_per_package` (null if either is 0/missing) | `src/lib/catalogOrdering.ts:13-18` | product unit / package | | |
| K-8 | Round up to orderable | no coverage or q ≤ 0 → `ceil(q)`; else `ceil(q/cov)·cov` (no float rounding) | `catalogOrdering.ts:24-31` | product unit | | |
| K-9 | Next orderable qty (nudge) | null if \|q/cov − round(q/cov)\| < 1e-3; else `round(ceil(q/cov)·cov·100)/100` | `catalogOrdering.ts:37-50` | product unit | | |
| K-10 | Order-sheet quantity | `roundUpToOrderable(q·(1+w/100), specs)` | `catalogOrdering.ts:59-66`, `src/lib/orderSheet.ts:78` | product unit | | |
| K-11 | Order-sheet unit | `catalogProduct.unit ?? item.unit`, trimmed, else "ea" | `orderSheet.ts:79` | — | | |
| K-12 | Order-sheet combine key | catalog id + color + unit / price-book id + color + unit / name + unit; quantities summed | `orderSheet.ts:100-104`, `:120-128` | — | | |
| K-13 | Order-sheet category order | alphabetical, "Other / Uncategorized" last; null or "Other" → Uncategorized | `orderSheet.ts:38-41`, `:137-151` | — | | |
| K-14 | Order-sheet filename | `Order Sheet - {project} - {supplier \|\| YYYY-MM-DD}.pdf`, illegal characters stripped | `orderSheet.ts:155-159` | — | | |
| K-15 | Line unit → order unit enum | alias map (pallet, ton, cy/yd, bag, lf, ea/each/pc); anything else → "each" | `orderSheet.ts:169-199` | enum | | |
| K-16 | Alert "Mark as ordered" line qty | unit is an order unit → est qty. Conversion unit → `ceil(est/conversion_factor)`. Else `max(1, round(est))` "each" | `src/lib/materialAlertActions.ts:12-22` | order unit | | |
| K-17 | Line planned cost (by type) | material → K-2; other types → `qty × unit_cost` (no waste) | `src/lib/costPlanMath.ts:74-76` | $ | | |
| K-18 | Section labor cost | lump → lump_sum; crew → `crew × days × hrs/day × rate`; hours → `man_hours × rate`; none → 0 | `costPlanMath.ts:90-95` | $ | | |
| K-19 | Section labor hours | hours → man_hours; lump with man_hours > 0 → man_hours; otherwise `crew × days × hrs/day` (lump falls back to the hidden crew fields) | `costPlanMath.ts:99-104` | man-hours | | |
| K-20 | Labor formula text | "3 guys × 4 days × 8 hrs × $30 = $2,880"; null when crew and days are both 0 | `costPlanMath.ts:115-133` | text | | |
| K-21 | Section totals by type | Σ lineCost into the line's type bucket + labor; total = sum of the 5 buckets | `costPlanMath.ts:150-156` | $ | | |
| K-22 | Plan totals (counted sections) | Σ sectionTotals over `countsTowardTotals` sections (proposed/removed excluded unless `all`) | `costPlanMath.ts:162-170`; used at `ProjectMaterialsView.tsx:1256` | $ | | |
| K-23 | Cost plan total | `sumSectionTotals(sections).total` | `costPlanMath.ts:174-176`; list page `MaterialSheetsView.tsx:38,42` | $ | | |
| K-24 | Breakdown label | only non-zero buckets, fixed order | `costPlanMath.ts:185-189` | text | | |
| K-25 | Cost-type grouping (draft invariant) | lines sorted by type rank, keeping order within a type; General forced last and single | `ProjectMaterialsView.tsx:356-365` | — | | |
| K-26 | New-section labor from template | crew mode, crew/days from the template, 8 h/day, rate = business `default_labor_rate ?? 45` | `ProjectMaterialsView.tsx:338-346`, `:544` | $ | | |
| K-27 | Calculator → line merge | exact-name match; qty/unit overwritten; catalog link set; remembered price only when unit_cost is 0; category only when unset; add-on lines added when qty > 0 | `ProjectMaterialsView.tsx:1023-1059`, `SmartSectionCalculatorDialog.tsx:141-160` | — | | |
| K-28 | Estimating-adjustment factor | factor = Π slot factors; ton lines `ceil(q·f·2)/2`, everything else `round(q·f·100)/100` | `SmartSectionCalculatorDialog.tsx:149-152` | qty | | |
| K-29 | Area/perimeter answer | sq ft mode: `{A, knownPerimeter ?? 4√A}`; L×W mode: `{L·W, 2(L+W)}` | `SmartSectionCalculatorDialog.tsx:376-388` | sq ft, ft | | |
| K-30 | Tunable resolution | contractor override, else template default, else 0 | `src/lib/smartSections/index.ts:48-56` | varies | | |
| K-31 | Row Est. (tracking) | `quantityWithWaste(revisedQty ?? draft qty, draft waste)` | `ProjectMaterialsView.tsx:2108-2117` | qty | | |
| K-32 | Row status | `lineStatus(est, ordered, delivered, used)` (no hasOrder argument) | `ProjectMaterialsView.tsx:2114` | enum | | |
| K-33 | Tracking bar widths | `min(100, delivered/denom·100)`, `min(100, used/denom·100)`, denom = max(est, ord, del, used, 1) | `ProjectMaterialsView.tsx:2444-2459` | % | | |
| K-34 | Over-estimate text | `(used − est).toFixed(2)` | `ProjectMaterialsView.tsx:2464` | qty | | |
| K-35 | Mark fully used | log qty = `max(0, delivered − used)` | `ProjectMaterialsView.tsx:632-634` | qty | | |
| K-36 | Header variance display | `±formatCurrency(var)` and `round(var%)` | `ProjectMaterialsView.tsx:1393-1399` | $, % | | |
| K-37 | Plan overhead rate | project.overhead_rate ?? headline quote overhead_rate ?? `burdenPerHour(settings)` | `ProjectMaterialsView.tsx:854-859` | $/man-hr | | |
| K-38 | Plan price / target margin | `projectContractValue(...)` (> 0 else null); project → quote → settings target | `ProjectMaterialsView.tsx:860-862` | $, % | | |
| K-39 | Tracked sheet ids | the approved quote's sheet + approved COs' sheets | `src/lib/materialTracking.ts:35-43` | — | | |
| K-40 | Tracking gate | no opportunity that's not won, and status ∉ {estimating, lost} | `materialTracking.ts:49-67` | bool | | |
| K-41 | Tracking summary | tracked count / total material lines | `materialTracking.ts:91-93`, `ProjectMaterialsView.tsx:1261-1262` | count | | |
| K-42 | Unit match | alias map (ton/cy/lf/bag/pallet/ea/roll/tube/layer/sf), lower-cased; equal after normalizing | `materialTracking.ts:118-165` | — | | |
| K-43 | Convert to sheet unit | same unit → q; delivery in the conversion unit → `q × conversion_factor`; else null (counts 0) | `materialTracking.ts:215-225`, `:275-278` | line unit | | |
| K-44 | Conversion prefill | price book: pallet coverage, else bag coverage; catalog: `coverage_per_unit × units_per_package` as a pallet | `materialTracking.ts:233-249` | sq ft/pkg | | |
| K-45 | Ordered qty | Σ converted qty of every matched order item (any status) | `materialTracking.ts:283-287` | line unit | | |
| K-46 | Delivered qty | Σ converted qty where the effective status is delivered (item status ?? order status) | `materialTracking.ts:259-264`, `:291-295` | line unit | | |
| K-47 | Used qty | Σ usage log qty (no conversion) | `materialTracking.ts:300-302` | line unit | | |
| K-48 | Effective estimate | latest baseline with a reason, else the live row; qty × (1 + waste) | `materialTracking.ts:323-346` | qty, $ | | |
| K-49 | Line status priority | over_estimate (est > 0 && used > est) > used_up (del > 0 && used ≥ del) > in_use > delivered > ordered (ord > 0 or hasOrder) > not_ordered | `materialTracking.ts:364-371` | enum | | |
| K-50 | Line actual cost | Σ delivered converted qty × (delivery unit_price ?? line unit_cost) | `materialTracking.ts:388-396` | $ | | |
| K-51 | Unplanned actual cost | Σ delivered unmatched qty × (unit_price ?? 0) | `materialTracking.ts:402-406` | $ | | |
| K-52 | Sheet cost summary | est = Σ estQty·estCost (every line); actual = unplanned + Σ line actual − return credits (reconciled + returned); var$ = act − est; var% = var$/est·100 (null if est = 0); counts only for tracked lines | `materialTracking.ts:440-477` | $, % | | |
| K-53 | Predicted material cost | null when there are no items, else summary.estimatedCost | `materialTracking.ts:105-108` | $ | | |
| K-54 | Alert: over estimate | est > 0 && used > est; label `round((used−est)/est·100)%` | `materialTracking.ts:552-554` | % | | |
| K-55 | Alert: over-ordered | est > 0 && ordered > est·(1 + margin%/100) | `materialTracking.ts:555-557` | % | | |
| K-56 | Alert: burn rate | job in progress: usage% − (elapsed/estimate·100) > 20 pp | `materialTracking.ts:541`, `:558-563`, `:510` | pp | | |
| K-57 | Alert: not ordered | est > 0 && no order item && start date set && daysUntilStart ≤ notOrderedAlertDays | `materialTracking.ts:543`, `:564-571` | days | | |
| K-58 | Alert: delivery overdue | order not delivered && expected date < today (local); days late = daysBetween | `materialTracking.ts:514-515`, `:574-585` | days | | |
| K-59 | Alert summary / start context | counts per kind in fixed order; "job starts in Nd / started Nd ago / today" | `materialTracking.ts:600-614` | text | | |
| K-60 | Leftover / needs reconciliation | `max(0, del − used)`; tracked, unreconciled lines with del ≠ used | `materialTracking.ts:624-641` | qty | | |
| K-61 | Feature material actual (Cost plan strip) | only when complete + all reconciled: Σ per feature `sheetCostSummary(lines).actualCost` | `ProjectMaterialsView.tsx:885-892` | $ | | |
| K-62 | Smart: round to half ton | `ceil(n·2)/2` | `src/lib/smartSections/paverPatio.ts:5` (same in seatingWall.ts:4, firePit.ts:4) | ton | | |
| K-63 | Paver: border / field area | border = include ? `perimeter × band_width(1 ft)` : 0; field = `max(A − border, 0)` | `paverPatio.ts:97-98` | sq ft | | |
| K-64 | Paver: pavers | product ? `roundUpToOrderable(field, specs)` : `ceil(field)`; unit = product unit ‖ "sq ft"; no waste | `paverPatio.ts:100-105` | sq ft | | |
| K-65 | Paver: border pavers | same as K-64 on the border area | `paverPatio.ts:107-116` | sq ft | | |
| K-66 | Paver: base | `halfTon(A × depth_in(5) / 165)` (165 labelled "sq ft/ton") | `paverPatio.ts:118-122`, `:37-40` | ton | | |
| K-67 | Paver: bedding sand | `halfTon(A × bedding_in(1) / 200)` | `paverPatio.ts:124-128` | ton | | |
| K-68 | Paver: geotextile | `ceil(A / 900)` | `paverPatio.ts:130-134` | roll | | |
| K-69 | Paver: edge restraint | `ceil(perimeter)` (perimeter estimated as 4√A when unknown) | `paverPatio.ts:136` | ft | | |
| K-70 | Paver: polymeric sand | `ceil(A / 80)` | `paverPatio.ts:138-142` | bag | | |
| K-71 | Seating wall: wall block | `ceil(L / (8/12)) × courses(2) + backrest blocks`; backrest = `ceil(min(bLF, L)/(8/12)) × bCourses` | `seatingWall.ts:115-125` | pieces | | |
| K-72 | Seating wall: caps | `ceil(L / (12/12))` | `seatingWall.ts:127-132` | pieces | | |
| K-73 | Seating wall: base | `halfTon(L × 1.5 × 0.5 / 27 × 1.35)` | `seatingWall.ts:134-135` | ton | | |
| K-74 | Seating wall: drainage | only if `courses × 9/12 > 1.5 ft`: `halfTon(L × 1 × 1 / 27 × 1.35)` | `seatingWall.ts:137-141` | ton | | |
| K-75 | Seating wall: adhesive | `ceil((L + backrest LF) / 20)` | `seatingWall.ts:144-148` | tube | | |
| K-76 | Seating wall: backrest caps | `ceil(bLF / 1)` | `seatingWall.ts:150-152` | pieces | | |
| K-77 | Fire pit: wall block / caps | `ceil(wallLF/(8/12)) × courses(3)`; `ceil(wallLF/1)` | `firePit.ts:98-102` | pieces | | |
| K-78 | Fire pit: base / interior fill | `halfTon(footprint × 6 / 165)`; `halfTon(interior × 6 / 165)` | `firePit.ts:104-114` | ton | | |
| K-79 | Fire pit: fire ring / adhesive | ring = 1 kit if toggled; adhesive `ceil((blocks + caps) / 30)` | `firePit.ts:116-126` | kit, tube | | |
| K-80 | Fireplace: footing | side = √footprint; `(side + 2·0.5)² × depth_in(12)/12/27`, rounded to 0.1 | `fireplace.ts:45-47`, `:56` | cu yd | | |
| K-81 | Fireplace: CMU / flue | blocks = `ceil(perimeter × height / 0.89)`; flue = `ceil(max(0, height − 3))` | `fireplace.ts:48-50` | pieces, ft | | |
| K-82 | Fireplace: veneer / mortar | veneer = `ceil(round(V·(1+10%)·100)/100)`; mortar = `ceil((blockFace + V)/100 × 8)` | `fireplace.ts:51-53` | sq ft, bag | | |
| K-83 | Fireplace: firebox / cap | 1 each when footprint > 0 | `fireplace.ts:58`, `:62` | kit, ea | | |
| K-84 | Pergola | postsPerSide = `ceil(L/10)+1` (L > 0); posts = ×2; beams = 2; rafters = `ceil(L·12/16)+1`; purlins = `ceil(W·12/12)+1`; footings = posts × 3 bags; hardware 1 lot | `landscape.ts:36-53` | ea, bag | | |
| K-85 | Water feature | side = √A; liner = `ceil((side + 2·depth(2) + 2·overlap(1))²)`; underlayment = liner; pump / plumbing = 1; stone = `round(A·2/100, 0.1)`; gravel = `round(A·2/12/27, 0.1)` | `landscape.ts:76-93` | sq ft, ton, cu yd | | |
| K-86 | Sod | withWaste = `A·(1+5%)`; sod = `ceil(withWaste/450)`; topsoil = `round(A·1/12/27, 0.1)`; fertilizer = `ceil(A/5000)` | `landscape.ts:111-119` | pallet, cu yd, bag | | |
| K-87 | Irrigation | heads = `ceil(A/200)`; zones = `ceil(A/1500)`; pipe = heads × 15; controller / backflow = 1 if zones; fittings = heads | `landscape.ts:139-151` | ea, ft | | |
| K-88 | Plants | trees / shrubs / perennials as entered; mulch = `round(bed·3/12/27, 0.1)`; amendment = `ceil((trees + shrubs) × 0.5)` | `landscape.ts:174-186` | ea, cu yd, bag | | |
| K-89 | Kitchen: veneer / CMU | `ceil(run/(8/12)) × courses(3)`; `ceil(run/(16/12)) × courses` | `outdoorKitchen.ts:126-130` | pieces | | |
| K-90 | Kitchen: rebar | cores = `ceil(run/(32/12)) + 1`; ft = `ceil(cores × courses × 8/12)` | `outdoorKitchen.ts:132-134` | ft | | |
| K-91 | Kitchen: mortar | `ceil(run × courses × 0.15 / 0.6)` | `outdoorKitchen.ts:136-137` | bag | | |
| K-92 | Kitchen: countertop | catalog mode only: `ceil(run)` | `outdoorKitchen.ts:139-146` | ft | | |
| K-93 | Kitchen: adhesive / caps | `ceil(run × wallHeight / 15)`; `ceil(run/1)` | `outdoorKitchen.ts:149-156` | tube, pieces | | |
| K-94 | Kitchen: backsplash | if > 0: `ceil(round(B·(1+10%)·100)/100)` | `outdoorKitchen.ts:158-162` | sq ft | | |
| K-95 | Lighting | fixtures = n; wire = `ceil(run/250)`; transformer = 1 (always); connectors = `ceil(n × 1.5)`; stakes = n; strip = `ceil(stripLF)` if > 0 | `outdoorLighting.ts:42-61` | ea, roll, ft | | |
| K-96 | Quick Quote qty | paver / pergola / water / sod / irrigation = area; kitchen = run; seating = LF; fire pit = wall LF; fireplace = count; lighting = fixtures; plants = count (all `Number(x)\|\|0`) | `src/lib/quickQuote/*.ts` (e.g. `paverPatio.ts:13`, `landscape.ts:6,59`) | sf/lf/ea | | |
| K-97 | Quick Quote rate / price | override ?? default; price = rate × qty | `quickQuote/index.ts:32-35`, `components/quotes/QuickQuoteFormDialog.tsx:91-93` | $ | | |
| K-98 | Measurements: rectangle | area = L·W; perimeter = 2(L+W) when both are > 0 | `src/lib/measurements.ts:552-556` | sq ft, ft | | |
| K-99 | Measurements: L-shape | area = `C·B + max(A−C, 0)·D`; perimeter = 2(A+B) when complete; valid if C ≤ A, D ≤ B | `measurements.ts:500-504`, `:557-561` | sq ft, ft | | |
| K-100 | Measurements: patio U-shape | area = `C·B + E·D + max(A−C−E, 0)·F`; perimeter = `2A + 2B + 2D − 2F` | `measurements.ts:516-523`, `:572-579` | sq ft, ft | | |
| K-101 | Measurements: walkway U-path | area = `max((A+B+C)·w − 2w², 0)`; perimeter = `2(A+B+C) − 2w` | `measurements.ts:508-514`, `:563-571` | sq ft, ft | | |
| K-102 | Measurements: irregular / total | Σ L·W of the areas / entered total (no perimeter) | `measurements.ts:550`, `:580-581` | sq ft | | |
| K-103 | Measurements: kitchen | linear = Σ active runs; height = entered ?? default 36; backsplash = `(len ?? linear) × h_in / 12` | `measurements.ts:585-594` | LF, in, sq ft | | |
| K-104 | Measurements: seating wall | linear = Σ runs; backrest LF = len ?? linear (when on and height > 0) | `measurements.ts:595-606` | LF, in | | |
| K-105 | Measurements: retaining wall | wall_sqft method, or LF × height_ft; height_in = ft × 12 | `measurements.ts:607-612` | LF, sq ft | | |
| K-106 | Measurements: fire pit | round: footprint = π(d/2)², perimeter = πd; rect: L·W, 2(L+W); custom: approx sq ft; height default 18 | `measurements.ts:613-628` | sq ft, ft, in | | |
| K-107 | Measurements: fireplace | footprint = w·d; perimeter = 2(w+d); veneer = (3-sided ? w + 2d : 2(w+d)) × h | `measurements.ts:629-642` | sq ft, ft | | |
| K-108 | Measurements: lighting / steps | fixtures = Σ non-strip qty; strip = Σ strip qty; steps = Σ count; tread LF = Σ count × width | `measurements.ts:643-656` | ea, LF | | |
| K-109 | Totals cleanup | drop values ≤ 0 or non-finite; round to 2 dp | `measurements.ts:496`, `:537-541` | — | | |
| K-110 | Sum of instances | additive keys summed (2 dp); perimeter only when every instance has one; height length-weighted, else max | `measurements.ts:662-694` | varies | | |
| K-111 | Project surface sq ft | Σ area of patio/flatwork instances in visible groups (null if 0) | `measurements.ts:872-877` | sq ft | | |
| K-112 | Height → courses | `max(1, round(height_in / course_height_in))` | `measurements.ts:926-927` | courses | | |
| K-113 | Smart Section prefill map | per build type (area+perimeter, run, LF+courses+backrest, perimeter→wall LF, fireplace height_ft = round(in/12, 2), fixtures/strip) | `measurements.ts:938-982` | varies | | |
| K-114 | Quick Quote prefill map | per build type; fireplace → count 1 when there's a footprint | `measurements.ts:985-1007` | varies | | |
| K-115 | Feet + inches | parse (comma → dot, ≥ 0); split = floor ft + round(in, 2) (12 carries); join = `round((ft + in/12)·10⁴)/10⁴` | `src/lib/feetInches.ts:3-29` | ft | | |
| K-116 | Overhead: annual | Σ amount × (month ? 12 : 1) (amount ≤ 0 → 0) | `src/lib/overhead.ts:76-79` | $/yr | | |
| K-117 | Overhead: crew-day hours | `(crew ?? 3) × (hrs/day ?? 8)` | `overhead.ts:82-83` | man-hrs | | |
| K-118 | Overhead: helper capacity | `workers × weeks × days × hours × min(util, 100)/100` (every input > 0) | `overhead.ts:86-91` | man-hrs/yr | | |
| K-119 | Overhead: productive hours | manual man-hours ‖ manual crew-days × crew-day hours ‖ helper | `overhead.ts:95-106` | man-hrs/yr | | |
| K-120 | Overhead: burden | annual / productive hours (null unless both > 0); per crew-day = burden × crew-day hours | `overhead.ts:110-120` | $/man-hr | | |
| K-121 | Planned man-hours / lump sums without hours / avg labor rate | Σ K-19 (counted); count of lump > 0 with hours ≤ 0; Σ labor $ / Σ hours | `overhead.ts:128-141` | man-hrs, $/hr | | |
| K-122 | True cost | overhead = hrs × rate; breakEven = direct + overhead; expected = price − direct; loaded = price − breakEven; margin % = /price; required = breakEven/(1 − t) for 0 < t < 100; gap = price − required; status red < 0, amber < t, else green | `overhead.ts:172-205` | $, % | | |
| K-123 | Labor must sell for | `(avg labor rate + burden) / (1 − t)` (t = 0 when unset); per crew-day × crew-day hours (fallback 24) | `overhead.ts:209-213`, `components/overhead/TrueCostCard.tsx:69`, `:109` | $/man-hr | | |
| K-124 | Labor display | hours, or `hours / crewDayHours` crew-days | `overhead.ts:222-228` | — | | |
| K-125 | Looks like overhead | job words excluded first, then overhead words regex | `overhead.ts:234-245` | bool | | |
| K-126 | Labor insight apply | crew: days = roundHalf(days × f); hours: round(mh × f, 0.1); lump: round($ × f) | `components/planned-actual/EstimatingHints.tsx:39-43` | days, hrs, $ | | |
| K-127 | Variance / tone | $ = round2(act − plan); % = $/plan; tone green ≤ amber% (0), amber ≤ red% (10), else red; plan ≤ 0 & act > 0 → red | `src/lib/plannedActual.ts:62-75` | $, % | | |
| K-128 | Labor tracking mode | none if no entries; per_feature if tagged hours ≥ 80% of total; else project with a split by planned $ share (hours share if $0) | `plannedActual.ts:200-229` | — | | |
| K-129 | PvA planned buckets / line rows | planned = Σ lineCost + section labor (counted); line planned = effectiveEstimate qty × cost; actual qty = used ‖ delivered | `plannedActual.ts:232-255`, `:277-281` | $, qty | | |
| K-130 | PvA material actual / pending | counted: + Σ line delivered cost; not counted and no material expenses → actual = planned (pending) | `plannedActual.ts:283-286` | $ | | |
| K-131 | PvA price per feature / General | featurePrice; General = approved quotes + approved CO items − Σ feature prices | `plannedActual.ts:257-273` | $ | | |
| K-132 | PvA profit / bridge | expected = price − planned; actual = price − actual; fully loaded − hours × rate; bridge top 6 drivers + "Everything else" + overhead-hours step | `plannedActual.ts:337-373` | $ | | |
| K-133 | PvA biggest over-plan | per-bucket and per-line overruns; not-counted materials use `(actQty − planQty) × planned unit cost`; top 5 ≥ $1 | `plannedActual.ts:376-409` | $ | | |
| K-134 | Feature history margin | `round((price − cost)/price × 100)` | `components/materials/FeatureHistoryDialog.tsx:91` | % | | |
| K-135 | Cost Plans list rollups | per sheet `costPlanTotal`; items = Σ lines; total = Σ sheets | `MaterialSheetsView.tsx:38-42` | $, count | | |

---

### 23. Code observations (unverified)

These are all **unverified**: they come from reading the code, with float results checked in Node using the same JS expressions. Math items come first.

| # | Observation | File:line | Why / example |
|---|---|---|---|
| OB-1 | **"Use N" then the Order Sheet orders one extra package.** The waste % is rounded to 2 dp and the order path has no float tolerance, but the nudge does | `materialsMath.ts:29-32`, `catalogOrdering.ts:28-30`, `:59-65` (compare the 1e-3 tolerance at `:47`) | 300 sq ft Blu 60 (116.82/pallet): "Use 350.46" sets waste 16.82% → 300×1.1682 = 350.46000000000004 → ceil(3.0000000000000004) = **4 pallets, 467.28 sq ft**. 130 sq ft @ 54 → 216 instead of 162. 7 @ 10 → 20 instead of 10. The Order Sheet PDF, "Mark as ordered" and the tracker's Ordered all get the inflated number |
| OB-2 | **Paver calculator writes float noise and re-rounds up a pallet.** `roundUpToOrderable` returns `ceil(q/cov)·cov` without rounding | `paverPatio.ts:102`, `catalogOrdering.ts:30` | 500 sq ft Blu 60 → Qty field shows **584.0999999999999**. 180 sq ft Blu Grande (87.91) → qty 263.73 (3 pallets), then the Order Sheet re-rounds it to **351.64 (4 pallets)** even at 0% waste |
| OB-3 | **Plain ceil of a float-noisy waste product**: no Catalog specs means `Math.ceil(q·(1+w))` | `catalogOrdering.ts:29`, `:64` | 180 @ 10% = 198.00000000000003 → Order Sheet **199**. 100 @ 10% → **111** |
| OB-4 | **Tracking row prints raw floats** (no `formatQty`) | `ProjectMaterialsView.tsx:2452`, `:2464` | 180 sq ft + 10% → "Est. **198.00000000000003** sq ft". Paver 350.46 × 1.1 → 385.50600000000003 |
| OB-5 | **Order Sheet "Mark as ordered" stores most units as "each"**, so Ordered/Delivered show 0 and actual cost is $0. `ORDER_UNIT_ALIASES` has no sq ft, cu yd, ft, roll, tube or layer. The tracker maps each→"ea", which never matches "sf"/"roll"/… | `orderSheet.ts:169-199`, `OrderSheetDialog.tsx:225`, `materialTracking.ts:215-225`, `:275-278` | Paver line 350.46 sq ft → order item 350.46 "each" → `convertToSheetUnit` returns null → Ordered **0**, row chip "**Not ordered**" (row calls `lineStatus` with no `hasOrder`, `ProjectMaterialsView.tsx:2114`), while the not-ordered alert is suppressed by `hasAnyOrder`. Once delivered, `lineActualCost` adds $0. The alert-bar path (`materialAlertActions.ts:12-22`) converts to pallets instead, so the two "mark ordered" buttons disagree |
| OB-6 | **Smart Section units "cu yd" and "ft" match nothing in the tracker.** The aliases cover cubic_yard→"cy" and linear_foot→"lf" but have no "cu yd"/"ft" | `materialTracking.ts:118-153`; emitters `fireplace.ts:56`, `landscape.ts:91,116,183`, `paverPatio.ts:136`, `outdoorKitchen.ts:134,143`, `outdoorLighting.ts:57` | A 1.2 "cu yd" topsoil line with a delivery logged as Cubic yard → delivered 0 and $0 actual until someone adds a conversion. The same happens for edge restraint "ft" vs Linear foot |
| OB-7 | **Coverage tunables are mislabelled.** The UI says "sq ft/ton", but the formula divides area×depth(in) by it, so the real unit is sq ft·in/ton | `paverPatio.ts:37-40`, `:120`; `firePit.ts:48-52`, `:106` | If a contractor types a real supplier figure of 33 sq ft/ton at 5", a 300 sq ft patio gets 300×5/33 = **45.5 t** instead of 9.5 t. The implied densities also disagree: 165 @ 5" ≈ 1.96 t/cy, but seating wall uses `tons_per_cuyd` 1.35 |
| OB-8 | **Waste can be applied twice.** Sod, fireplace veneer and kitchen backsplash bake waste into qty, and the line's own Waste % multiplies again in the total, Est. and Order Sheet. The editor footnote says waste isn't set there | `landscape.ts:113`, `fireplace.ts:51-52`, `outdoorKitchen.ts:160-161`, `SmartSectionTemplateEditorDialog.tsx:292-294` | 200 sq ft veneer → calc gives 220. With line waste 10% → **242** |
| OB-9 | **Pallets are rounded before waste** on paver lines, and the Qty field then holds the orderable number instead of the measured one | `paverPatio.ts:102` vs `ProjectMaterialsView.tsx:2167-2169` | Need 300 + 10% = 330 → 3 pallets would do. The calc stores 350.46, then ×1.1 = 385.5 → **4 pallets**. This also defeats the "Use N keeps the measured qty" design |
| OB-10 | **Zero can't be entered** for most calculator inputs and tunables (`Number(x) \|\| default`). The editor saves 0 and it's silently ignored | `paverPatio.ts:87-93`, `seatingWall.ts:95-109`, `firePit.ts:80-94`, `outdoorKitchen.ts:107-121`, `landscape.ts:79` (depth), `:39`; `SmartSectionTemplateEditorDialog.tsx:279`; `SmartSectionCalculatorDialog.tsx:287` | Bedding depth 0 → still 1" (300 sq ft → 1.5 t sand). Base depth 0 → 5". Courses 0 → 2/3. Water-feature depth 0 → 2 ft. The waste tunables do accept 0, so behavior is inconsistent |
| OB-11 | **The estimating-adjustment factor breaks whole units** (everything except tons rounds to 0.01) and breaks catalog package multiples | `SmartSectionCalculatorDialog.tsx:152` | 45 blocks × 1.15 = **51.75 pieces**. 3 bags × 1.1 = 3.3 bags. Pavers 350.46 × 1.1 = 385.51 (not a pallet multiple, so it gets nudged or re-rounded again) |
| OB-12 | **cu yd / ton / stone lines round to the nearest 0.1, not up** | `landscape.ts:90-91`, `:116`, `:183`; `fireplace.ts:56` | Sod 15 sq ft topsoil at 1" = 0.046 → **0 cu yd**. Footing 1.04 cu yd → 1.0. It can under-order |
| OB-13 | **Hidden crew figures carry overhead on lump-sum labor.** Switching Crew → Lump sum keeps crew/days/hrs, and `sectionLaborHours` falls back to them when man-hours is blank | `costPlanMath.ts:102-103`, `SectionLaborBlock.tsx:76-79`, `overhead.ts:133` | 3×4×8 crew → Lump $2,500 with blank man-hours → still **96 h** of overhead and counted in avg labor rate, and the "no man-hours" warning never fires |
| OB-14 | **Labor insight "Apply ×f" compounds** on repeated clicks. On lump sum it scales $ but not man-hours, so overhead stays the same | `EstimatingHints.tsx:39-43` | Lump $2,000, f=1.2 clicked twice → $2,880 |
| OB-15 | **Unit mix-up between the calculator unit and the Catalog product unit.** The calc sets unit "ft"/"pieces", but the Order Sheet prints the product's unit and rounds by its package | `outdoorKitchen.ts:142-144`, `seatingWall.ts:120-125`, `orderSheet.ts:78-79` | A countertop product sold per sq ft: 12 linear ft → PDF says "**12 sq ft**". A wall-block product in sq ft: 30 pieces printed as 30 sq ft. The seeded catalog is all Pavers/sq ft, so this is latent until wall-block or cap products are added |
| OB-16 | **Kitchen / pergola / lighting simplifications may under- or over-count** | `outdoorKitchen.ts:149` (adhesive on one face only), `landscape.ts:40-41` (posts ignore width, so a 20×20 pergola gets 6 posts and no middle row), `outdoorLighting.ts:51` (transformer = 1 even with 0 fixtures), `measurements.ts:926-927` (36" counter / 8" course = 4.5 → **5 courses**, 40") | Assumptions to confirm with the user |
| OB-17 | **Fireplace CMU uses overall height (chimney included) × full 4-side perimeter**, even when veneer is 3-sided | `fireplace.ts:48-49`, `measurements.ts:638-640` | 4×3 ft, 8 ft tall → 14×8/0.89 = **126 blocks**. The chimney is usually narrower |
| OB-18 | **Planned-vs-actual material actual ≠ the header "Actual to date".** PvA leaves out unplanned deliveries and return credits, which `sheetCostSummary` includes. PvA also adds material expenses on top of delivered cost, so there's a double-count risk when receipts are logged too | `plannedActual.ts:283-284` vs `materialTracking.ts:446`, `:455-457`; warning comment `financials.ts:64-67` | Same project, two different "actual" numbers |
| OB-19 | **PvA planned material uses live `lineCost`, but line rows use the revised baseline**, so after a Revise estimate the difference shows up as a phantom "Other materials" profit-bridge driver | `plannedActual.ts:279` vs `:243`, `:349-350` | |
| OB-20 | **Header "Estimated" (saved rows, revised baseline) ≠ Total cost card Materials (live draft)** while editing or after a revise | `ProjectMaterialsView.tsx:590` vs `:1256` | |
| OB-21 | **Save isn't atomic and duplicates rows on retry.** The awaits run in sequence, and after a mid-way failure the draft keeps its tmp ids and dirty stays true | `ProjectMaterialsView.tsx:1079-1241` | If an item insert fails after 3 lines were created, Save again → those 3 lines are **created again (cost doubled)**. On a brand-new plan, a retry runs `createMaterialsSheet` again → a second "Cost plan" sheet (the page uses `sheets[0]`) |
| OB-22 | **A Price Book pick keeps the hidden color from an earlier Catalog pick.** `applyPick` doesn't clear `color`, the Color field is hidden once the line isn't Catalog, but the color is still saved and printed | `ProjectMaterialsView.tsx:2135-2148`, `:2204`; `orderSheet.ts:93-94` | The Order Sheet title reads "Polymeric Sand — Onyx Black" |
| OB-23 | **Negative values are accepted** for qty, waste and unit cost (no `min`) | `ProjectMaterialsView.tsx:2303-2356`, `CostLineRow.tsx:143-187` | Waste −100% zeroes the line. Qty −5 makes the total negative |
| OB-24 | **"Fill quantities" never shows for a template with a non-material line.** Non-material seed lines start at qty 1, and the offer needs every qty to be 0 | `ProjectMaterialsView.tsx:1834`, `:287-290` | Add "Excavation sub" in the template editor → the badge is gone on every new section |
| OB-25 | **↑/↓ arrows are no-ops at type-group boundaries.** The last material line's ↓ gets re-sorted back by `normalizeDraft` | `ProjectMaterialsView.tsx:1972-1973`, `:1990-1991`, `:356-365` | The button stays enabled but does nothing |
| OB-26 | **Overhead crew size can't be retyped.** `v ?? 3` plus the Num re-sync effect means clearing 5 inserts "3", so typing 4 gives "34" | `SettingsOverheadView.tsx:180`, `:262-267` | |
| OB-27 | **Overhead amount with a comma saves 0**: `Number("1,200")` is NaN, which becomes 0 | `SettingsOverheadView.tsx:118` | $1,200/mo becomes $0 |
| OB-28 | **Stale comments contradict the behavior**: waste "reference-only, never applied" and "Material Tracker shows on every sheet regardless of status" | `catalogOrdering.ts:53-55`, `ProjectMaterialsView.tsx:534-539` vs `:589` | |
| OB-29 | **"Total cost · N sections" counts General and proposed/removed sections** that aren't in the total | `ProjectMaterialsView.tsx:1521` | |
| OB-30 | **Quick Quote fireplace**: a blank count gives price $0 but the description says "an outdoor fireplace" | `quickQuote/fireplace.ts:12`, `:14` | |
| OB-31 | **"Material sheet" wording is still around** | `ProjectMaterialsView.tsx:1455` ("Failed to load materials"), `:1666` ("not on this sheet"), `:1682` ("Match to a sheet line…"); `OrderSheetDialog.tsx:293` ("No line items on this sheet yet."); `MaterialSheetsView.tsx:60`, `:71`, `:75`, `:87` ("Search sheets", KPI "Sheets", column "Sheet") | |
| OB-32 | **Mobile layout risks** | `OrderSheetDialog.tsx:306` (Supplier combobox + date input squeezed 2-up in a phone dialog); `EmailOrderSheetStep.tsx:101` (blob-PDF iframe preview is unreliable on iOS Safari); `CostLineRow.tsx:141-188` (fixed w-20/w-24/w-28 fields wrap unevenly); `ProjectMaterialsView.tsx:2452` (long Est./Ordered line, which float noise makes worse) | |

---

## Area 05 — Quotes, Client Selections, change orders

Feature inventory for manual verification. Read-only code review of `main` @ 281bf8b (2026-09-28).
Status / Note columns are intentionally empty — fill them in while testing.

Roles: **Owner** = signed-in contractor. **Client** = anyone holding a public share link (no auth).
States: quote `draft` / `sent` (shown as "Shared") / `approved` / `declined`; kind `original` vs `addon`.
Change order `draft` / `sent` / `approved` / `declined`.

---

### 1. `/quotes` — Quotes list (`src/components/views/QuotesView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 1.1 | "+ New quote" (desktop header) | Button | `createQuote()` with no project/client (deposit %/terms from Settings > Quote defaults, overhead rate stamped), navigates to `/quotes/:id` | Owner | | |
| 1.2 | "+ New" (mobile header) | Button | Same as 1.1 | Owner · mobile | | |
| 1.3 | Search (mobile header) | Text input | Filters by project name or client name (case-insensitive) | Owner · mobile | | |
| 1.4 | Search (desktop) | Text input | Same as 1.3 | Owner · desktop | | |
| 1.5 | Filter segment All / Open / Draft / Shared / Approved | Segmented control | Filters the list; "Open" = draft + sent; each chip shows its count; `?filter=` URL param preselects | Owner · desktop | | |
| 1.6 | Filter pills (same options) | Pills | Same as 1.5 | Owner · mobile | | |
| 1.7 | KPI "Out for signature" | Display | Sum of `quoteTotal` of sent quotes + count | Owner · desktop | | |
| 1.8 | KPI "Approved" | Display | Sum of approved quote totals + count | Owner · desktop | | |
| 1.9 | KPI "Avg. quote" | Display | Mean of quote totals > 0 (rounded) | Owner · desktop | | |
| 1.10 | KPI "Drafts" | Display | Count of drafts | Owner · desktop | | |
| 1.11 | Table row (whole row) | Row link | Opens `/quotes/:id` | Owner · desktop | | |
| 1.12 | Row "Client activity" badge | Display | Views / going-cold badge (QuoteActivityBadge) | Owner · sent | | |
| 1.13 | Row ⋯ menu trigger | Icon button | Opens menu; click does not open the row | Owner | | |
| 1.14 | ⋯ "Open project" | Menu item | Navigates to `/projects/:project_id` (only when linked) | Owner · project-linked | | |
| 1.15 | ⋯ "Delete" | Menu item | `deleteQuote()` — marks add-on's proposed features removed, deletes quote. No confirm dialog | Owner · any status | | |
| 1.16 | Mobile ListCard | Whole-card link | Opens `/quotes/:id`; shows status eyebrow, total, client, updated date, activity badge | Owner · mobile | | |
| 1.17 | Empty state "No quotes here." | Display | Shown when filter/search match nothing | Owner | | |

### 2. Quote builder — `/quotes/:quoteId` and `/projects/:id/quotes/:quoteId` (`src/components/views/QuoteWorkspace.tsx`)

#### 2.1 Header and navigation

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.1.1 | Back link (desktop) | Link | Returns to Quotes list or Project quotes page depending on route; unsaved-changes guard prompts | Owner | | |
| 2.1.2 | Mobile header back | Link | Same as 2.1.1 | Owner · mobile | | |
| 2.1.3 | Title + status pill | Display | Project name or "Standalone quote"; pill from `quoteStatusMeta` | Owner | | |
| 2.1.4 | "Go to project" (desktop) | Button link | `/projects/:id` | Owner · project-linked | | |
| 2.1.5 | "Go to project · {name}" (mobile) | Button link | Same | Owner · mobile · project-linked | | |
| 2.1.6 | "Send for signature" (desktop header) | Button | Mints share token if needed, freezes overhead rate if none stored, sets status `sent`, snapshots version, logs `quote_sent`, auto-advances linked opportunity to Proposal Sent, opens ShareLinkDialog. Disabled while dirty ("Save your changes first") | Owner · draft | | |
| 2.1.7 | "Share link" (desktop header) | Button | Opens ShareLinkDialog with persisted link | Owner · sent/approved/declined | | |
| 2.1.8 | "Save your changes first" hint | Display | Shown when dirty on a draft | Owner · draft · dirty | | |

#### 2.2 Approval row (`src/components/quotes/QuoteApprovalRow.tsx`) + ManualApprovalDialog (`src/components/common/ManualApprovalDialog.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.2.1 | "Mark approved" | Button | Opens ManualApprovalDialog; disabled with tooltip "Save your changes first" when dirty | Owner · draft/sent | | |
| 2.2.2 | Approved banner (client) | Display | "Approved by the client in the Client Hub — signed by X" + date | Owner · approved (client) | | |
| 2.2.3 | Approved banner (manual) | Display | "Approved {in person/on paper/another way} by X — recorded by Y" + date + note | Owner · approved (manual) | | |
| 2.2.4 | Dialog method: In person / Signed on paper / Other | Toggle buttons | Pick approval method (default "Signed on paper") | Owner | | |
| 2.2.5 | Dialog "Approved by" | Text input | Prefilled with client name | Owner | | |
| 2.2.6 | Dialog "Date" | Date input | Defaults to today (local), max today | Owner | | |
| 2.2.7 | Dialog "Note (optional)" | Textarea | Saved as approval_note | Owner | | |
| 2.2.8 | Dialog "Mark approved" | Button | `contractor_approve_quote` RPC — approves, Won, schedules project, drafts deposit invoice; toast; disabled without date or while pending | Owner | | |
| 2.2.9 | Dialog close (X / Esc / outside) | Dialog control | Closes without approving; fields reset on reopen | Owner | | |

#### 2.3 Activity line (`src/components/quote-activity/QuoteActivityLine.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.3.1 | Activity line button | Button | Shows views summary + going-cold chip; opens Quote activity dialog | Owner · non-draft | | |
| 2.3.2 | Quote activity dialog | Dialog | Sessions/events grouped by version; close control | Owner | | |

#### 2.4 Add-on quote banner

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.4.1 | Banner "Add-on quote #n · new work on this job" | Display | Lists the add-on's proposed features; explains they join totals only once approved | Owner · addon | | |
| 2.4.2 | "1 · Measure it (project page)" | Link | `/projects/:id#measure-{category}` — opens and pulses that feature's Measurements card | Owner · addon | | |
| 2.4.3 | "2 · Price it in the Cost plan" | Link | `/projects/:id/materials#section-{id}` — scrolls to and flashes the feature's Cost plan section | Owner · addon | | |
| 2.4.4 | "3 · Price each section here and send" | Display | Instruction text | Owner · addon | | |

#### 2.5 Client Share Card

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.5.1 | Client card | Whole-card button | Opens ClientPickerDialog | Owner | | |
| 2.5.2 | ClientPickerDialog (search, pick, new client, clear) | Dialog | Picks/creates/clears client; saves immediately (not part of draft) | Owner | | |
| 2.5.3 | Project card (linked) | Whole-card overlay link | Go to project (GoToProjectLink, honors unsaved guard, cmd-click new tab) | Owner · project-linked | | |
| 2.5.4 | Project card (standalone) | Whole-card button | "Create project" flow: saves draft first if dirty (approved → confirm), then `/projects/new` with `linkQuoteId` | Owner · standalone | | |
| 2.5.5 | Project chevron select | Select | Move quote to another project / "No project" (unlink); saves immediately | Owner | | |
| 2.5.6 | Link status dot + label | Display | "Client link is live" when a token exists, else "not sent yet" | Owner | | |
| 2.5.7 | URL box | Display | Share URL or "Generated the first time you share or preview" | Owner | | |
| 2.5.8 | "Share" | Button | Mints token without changing status, opens ShareLinkDialog; disabled while dirty/pending | Owner · any | | |
| 2.5.9 | Copy (icon) | Button | Mints token without changing status, copies URL, toast | Owner · any | | |

#### 2.6 Sections list (LineItemSectionCard / SectionCard / SectionNameField / SectionTypeChip)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.6.1 | Empty state "No sections yet…" | Display | When quote has no sections | Owner | | |
| 2.6.2 | "Collapse all" / "Expand all" | Links | Collapse/expand every section (persisted in localStorage) | Owner | | |
| 2.6.3 | Section drag handle | Drag handle | Reorder sections; keyboard arrows while focused | Owner | | |
| 2.6.4 | Section move up / down | Icon buttons | Reorder one step; disabled at ends | Owner | | |
| 2.6.5 | Collapse chevron | Icon button | Toggle section collapsed; auto-expands on hover while dragging an item | Owner | | |
| 2.6.6 | Section name field | Text input | Rename (draft); on commit, a matching feature name auto-tags type | Owner | | |
| 2.6.7 | Feature picker listbox (project features / types) | Combobox list | Picks existing feature (sets feature_id), "new feature of type" (created on Save; add-on quotes create it `proposed` with source_quote_id), or bare type; "Already added" marker; auto-opens on "Add section" | Owner | | |
| 2.6.8 | "Other features…" | Button | Reveals non-project types | Owner | | |
| 2.6.9 | "Use "{typed}" as the name" | Button | Keeps typed text as name | Owner | | |
| 2.6.10 | Section subtotal (header) | Display | Sum of every line (required + optional) + section's selections | Owner | | |
| 2.6.11 | Feature cost chip "{Type} · Cost $X" | Popover trigger | Opens internal popover: Section price, Direct cost, Expected margin, Allocated overhead (man-hours × rate), Fully loaded margin, or "Set up overhead" link | Owner · feature section | | |
| 2.6.12 | Section margin tag "Margin n%" | Display | (price − linked cost)/price; red when negative | Owner · linked cost | | |
| 2.6.13 | Type chip (non-feature section) | Popover/sheet | Project type rows (None + project's types; "not on project" marker) | Owner · non-feature | | |
| 2.6.14 | Type chip — "Linked cost plan sections": Auto / per-section checkboxes / None | Rows + checkboxes | Sets materials_link_mode auto/manual + picks; drives section cost & margin | Owner · non-feature | | |
| 2.6.15 | Toolbar "Quick quote" / "Update quick quote" / "Measurements available · Quick quote" | Button | Section Quick Quote: known build type → form directly; else build-type picker | Owner | | |
| 2.6.16 | Toolbar "Add client selection" | Button | Opens SelectionGroupDialog (new); hidden on unsaved sections and approved quotes | Owner · saved section · not approved | | |
| 2.6.17 | Toolbar "Insert saved group" ▾ + template items | Dropdown | Opens SelectionGroupDialog seeded from a saved template | Owner · templates exist · not approved | | |
| 2.6.18 | "Optional section — client can add or drop it" | Switch | Marks section optional (draft) | Owner | | |
| 2.6.19 | Delete section (trash) | Icon button + AlertDialog | Confirm "Delete '{name}'? Removes n items totaling $X" → Remove / Cancel (draft only) | Owner | | |
| 2.6.20 | "Add item to this section" | Button | Adds blank line (qty 1, unit "ea", price 0, client_selected true) | Owner | | |

#### 2.7 Line item row (`src/components/common/LineItemRow.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.7.1 | Item name | Auto-grow textarea | Edit name (draft) | Owner | | |
| 2.7.2 | Item drag handle | Drag handle | Reorder within / across sections | Owner | | |
| 2.7.3 | Item move up / down | Icon buttons | Reorder one step | Owner | | |
| 2.7.4 | Remove item (trash) | Icon button | Removes line immediately from draft (no confirm) | Owner | | |
| 2.7.5 | Description | Auto-grow textarea | Edit description | Owner | | |
| 2.7.6 | Category | Select | Work category (Uncategorized + Settings categories) — drives Revenue by category | Owner | | |
| 2.7.7 | Photo thumbnails | Buttons | Open lightbox | Owner | | |
| 2.7.8 | Add photo | Button + file input | Pick/capture images; compressed and held in draft; uploaded on Save | Owner | | |
| 2.7.9 | Lightbox "Remove photo" | Button | Removes image from draft | Owner | | |
| 2.7.10 | Qty | Number input | Quantity (half-typed values kept) | Owner | | |
| 2.7.11 | Unit | Text input | Free-text unit label (not in math) | Owner | | |
| 2.7.12 | Rate ($) | Number input | Unit price | Owner | | |
| 2.7.13 | Line total | Display | qty × rate; red with "−" when negative | Owner | | |
| 2.7.14 | "Optional add-on — client chooses whether to include this line" | Checkbox | Marks item optional | Owner | | |

#### 2.8 Client Selections — contractor side (`src/components/selections/QuoteSectionSelections.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.8.1 | "Client selections · Now $X · range $min – $max (internal)" | Display | Current selections price for this section and possible range | Owner | | |
| 2.8.2 | Group header (name, Required/Optional, multiple, who picked) | Display | "Client picked / You picked / Default / Changed by CO"; "Approved on …" lock when approved | Owner | | |
| 2.8.3 | Edit group (pencil) | Icon button | Opens SelectionGroupDialog for that group | Owner · not approved | | |
| 2.8.4 | Remove group (trash) | Icon button | Deletes group immediately (no confirm), snapshots version if not draft | Owner · not approved | | |
| 2.8.5 | Option chips | Toggle buttons | Pick on the client's behalf (single replaces, multi toggles); saves immediately; shows price label, default tag, internal "margin ±$" | Owner · not approved | | |
| 2.8.6 | "Internal cost adjustment now: $X" | Display | Σ cost_delta of effective options | Owner · not approved | | |

#### 2.9 SelectionGroupDialog (`src/components/selections/SelectionGroupDialog.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.9.1 | Name | Text input | Group name (required) | Owner | | |
| 2.9.2 | Help text | Text input | Client-facing hint | Owner | | |
| 2.9.3 | Required | Checkbox | Client must choose before signing (default on) | Owner | | |
| 2.9.4 | Multiple | Checkbox | Allow several options | Owner | | |
| 2.9.5 | "Add from Catalog" | Button | Opens catalog sub-dialog | Owner | | |
| 2.9.6 | "Add option" | Button | New option row (first one default) | Owner | | |
| 2.9.7 | Catalog sub-dialog: product pick, color chips, cancel, "Add" | Dialog | Adds one option per chosen color (price/cost 0) | Owner | | |
| 2.9.8 | Option photo | File input | Uploads selection image | Owner | | |
| 2.9.9 | Option name / description | Inputs | Required name | Owner | | |
| 2.9.10 | Remove option | Icon button | Deletes row | Owner | | |
| 2.9.11 | Price mode Included / + Add / − (credit) | Radio group | Sets sign of price_delta | Owner | | |
| 2.9.12 | Amount ($) | Input | Magnitude of price change | Owner | | |
| 2.9.13 | Internal cost change ($) | Input | cost_delta (internal only) | Owner | | |
| 2.9.14 | "Changes a Cost plan line (optional)" | Select | Link option to a Cost plan line changed on approval | Owner · linkable lines | | |
| 2.9.15 | New unit cost | Input | link_set.unit_cost | Owner · linked | | |
| 2.9.16 | Default | Checkbox | Default option (single: exclusive) | Owner | | |
| 2.9.17 | "Client sees: …  · margin $X" preview | Display | Price label and margin impact | Owner | | |
| 2.9.18 | "Save as template" | Checkbox | Also saves to selection templates | Owner | | |
| 2.9.19 | Cancel / Save | Buttons | Save disabled until name + ≥2 named options | Owner | | |

#### 2.10 Add section / Quick Quote

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.10.1 | "Add section" | Button | Adds blank draft section, auto-opens its feature picker | Owner | | |
| 2.10.2 | "Add Quick Quote" | Button | Page-level QQ: opens build-type picker; result becomes a new one-line section (tagged type + first unused feature of that type) | Owner | | |
| 2.10.3 | QuickQuoteDialog "What are you building?" rows | Buttons | Pick build type → opens form | Owner | | |
| 2.10.4 | QQ form: measurement prefill picker | Picker | Fills answers from project/feature measurements | Owner | | |
| 2.10.5 | QQ form: questions (area sq ft / dimensions toggle, number fields, catalog product picker) | Inputs | Drive quantity | Owner | | |
| 2.10.6 | QQ form: Rate ({unit}) | Number input | Prefilled from Settings > Quick Quote Rates | Owner | | |
| 2.10.7 | QQ form: live price | Display | rate × quantity | Owner | | |
| 2.10.8 | QQ form: similar-job hint | Display | Past jobs' cost/sold per unit | Owner | | |
| 2.10.9 | QQ "Continue" | Button | Goes to preview, runs AI description (timeout → fallback text) | Owner | | |
| 2.10.10 | QQ preview: back to form | Button | Returns to form | Owner | | |
| 2.10.11 | QQ preview: Regenerate description | Button | Re-runs AI description | Owner | | |
| 2.10.12 | QQ preview: Description | Textarea | Editable | Owner | | |
| 2.10.13 | QQ "Create" / add | Button | Adds / updates the line (disabled while generating) | Owner | | |
| 2.10.14 | "This section already has items" dialog: Cancel / "Add as a new line" / "Replace items in this section" | AlertDialog | Section QQ on a section with non-QQ items | Owner | | |
| 2.10.15 | Section QQ re-run | Behavior | Updates existing QQ line in place (keeps id, photos, category) | Owner | | |

#### 2.11 Notes / deposit

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.11.1 | Notes | Auto-grow textarea | Client-facing notes (draft) | Owner | | |
| 2.11.2 | Deposit required (%) | Number input | Deposit % (draft); empty → 0 | Owner | | |

#### 2.12 Totals card (desktop right rail)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.12.1 | Per-section rows | Display | Required sections' base subtotal | Owner · desktop | | |
| 2.12.2 | "Selected add-ons" row | Display | Optional lines currently client_selected | Owner · desktop | | |
| 2.12.3 | "+ $X in optional add-ons the client can pick" | Display | Optional lines not selected | Owner · desktop | | |
| 2.12.4 | "Client selections: $X now … could range $a – $b" | Display | When selection range differs | Owner · desktop | | |

#### 2.13 Quote summary card (desktop + mobile variants)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.13.1 | Quote total | Display | Required + selected optional + selections, no tax | Owner | | |
| 2.13.2 | "Margin n%" badge | Display | (total − est. cost)/total; hidden when cost unknown | Owner · cost known | | |
| 2.13.3 | Base (required) / Optional items (n) | Display | Only when ≥1 selected optional item | Owner | | |
| 2.13.4 | Deposit n% | Display | Deposit amount | Owner | | |
| 2.13.5 | Est. cost | Display | Cost plan total (+ selection cost deltas pre-approval); "Not available" standalone / no plan | Owner | | |
| 2.13.6 | Profit / Estimated profit | Display | total − est. cost or "Not available" | Owner | | |
| 2.13.7 | True cost · internal (collapsible on mobile) | Toggle button + rows | Direct cost, Overhead burden, Break-even, Quote price, Expected profit, Fully loaded profit, Price for target, Labor must sell for, lump-sum warning | Owner · project + cost plan | | |
| 2.13.8 | "Recalculate with current overhead" | Link button | Writes current burden rate + target margin to quote | Owner · draft · rate differs | | |
| 2.13.9 | "Set up overhead to see true profit →" | Link | `/settings/overhead` | Owner · overhead not set up | | |
| 2.13.10 | Cost plan CTA: "Create project to add a cost plan" / "Add cost plan" / "View cost plan" | Button / link | Standalone → create-project flow; else `/projects/:id/materials` (saves first if dirty) | Owner | | |
| 2.13.11 | Send for signature / Share link | Button | Same as 2.1.6 / 2.1.7 | Owner | | |
| 2.13.12 | Preview | Button | Mints token (no status change), opens `/quote/:token` in new tab; disabled while dirty | Owner | | |

#### 2.14 Terms card

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.14.1 | Valid until | Display | created_at + Settings validity days | Owner | | |
| 2.14.2 | Deposit label | Display | "{n}% at signing" | Owner | | |
| 2.14.3 | Terms | Auto-grow textarea | Per-quote terms (draft) | Owner | | |
| 2.14.4 | "Use my default terms" | Link button | Fills empty terms with Settings default | Owner · terms empty | | |
| 2.14.5 | "Save as my default terms" / "Your default terms" | Link button | Saves current terms to Settings > Quote defaults immediately | Owner | | |

#### 2.15 Save / dialogs

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 2.15.1 | DraftSaveBar "Discard" | Button | Reverts draft to server state, revokes local previews | Owner · dirty | | |
| 2.15.2 | DraftSaveBar "Save changes" | Button | Diffs and writes sections/items/images/links/notes/terms/deposit; creates new features; snapshot if not draft | Owner · dirty | | |
| 2.15.3 | Leave-page guard | Prompt | "Save changes before leaving?" + browser unload warning while dirty | Owner · dirty | | |
| 2.15.4 | "Editing an approved quote" AlertDialog: Cancel / "Save and revert to draft" | AlertDialog | Reverts to draft, clears signature + manual-approval fields, then saves; logs `quote_reverted` | Owner · approved | | |
| 2.15.5 | ShareLinkDialog: URL field (select on focus) | Input | Read-only link | Owner | | |
| 2.15.6 | ShareLinkDialog "Copy" | Button | Clipboard + toast | Owner | | |
| 2.15.7 | ShareLinkDialog "Text" | Link | `sms:` deep link with message | Owner | | |
| 2.15.8 | ShareLinkDialog "Email" | Link | `mailto:` with subject/body | Owner | | |

### 3. `/projects/:id/quotes` — Project quotes (`src/components/views/ProjectQuotesView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 3.1 | Back to project (desktop) / mobile back | Link | `/projects/:id` | Owner | | |
| 3.2 | "New quote" / "Add an option" | Button | Creates project quote with project's client; first quote gets one section per project feature; opens builder | Owner · project not Won | | |
| 3.3 | "Add new work" | Button | Opens AddNewWorkDialog | Owner · project Won/active | | |
| 3.4 | Mobile header pill "n with the client" | Display | Count of sent quotes | Owner · mobile | | |
| 3.5 | KPI "Signed" | Display | projectContractValue(quotes, []) — headline + approved add-ons; "—" when nothing approved | Owner | | |
| 3.6 | KPI "With the client" | Display | Σ totals of sent quotes + count | Owner | | |
| 3.7 | KPI "Drafts" | Display | Σ totals of drafts + count | Owner | | |
| 3.8 | KPI "Deposit" | Display | headline deposit % × total; "invoiced INV-x" / "not invoiced yet" (red) | Owner · approved headline | | |
| 3.9 | "With the client" band row link | Link | Opens quote; shows kind label, total, going-cold / decision line | Owner · sent | | |
| 3.10 | Band "Copy link to resend" | Button | Copies share URL | Owner · sent · token | | |
| 3.11 | Band "Mark approved" | Button | Opens ManualApprovalDialog | Owner · sent | | |
| 3.12 | Quote card (left block) | Link | Opens quote; kind label (Original quote / Option / revision / Add-on #n / Quote), status, activity badge, up to 3 section chips + "+n more", decision line | Owner | | |
| 3.13 | Quote card amount block | Link | Opens quote; total + "n% deposit" (originals) | Owner | | |
| 3.14 | "Finish & send" | Button link | Opens builder | Owner · draft | | |
| 3.15 | "Mark approved" | Button | ManualApprovalDialog | Owner · sent | | |
| 3.16 | "Deposit invoice" | Button | `createProjectInvoice(id, "deposit")` → opens invoice | Owner · signed original · deposit > 0 · no deposit invoice | | |
| 3.17 | ⋯ "Open" | Menu item | Opens quote | Owner | | |
| 3.18 | ⋯ "Mark approved" | Menu item | ManualApprovalDialog | Owner · draft | | |
| 3.19 | ⋯ "Copy client link" | Menu item | Copies URL | Owner · token | | |
| 3.20 | ⋯ "Client's page (print / PDF)" | Menu item | Opens `/quote/:token` | Owner · token | | |
| 3.21 | ⋯ "Open deposit invoice" | Menu item | Opens deposit invoice | Owner · signed original · deposit invoice exists | | |
| 3.22 | Empty state + primary action | Display + Button | "No quotes yet…" | Owner | | |
| 3.23 | ManualApprovalDialog (as 2.2.4–2.2.9) | Dialog | Approves chosen quote | Owner | | |

### 4. AddNewWorkDialog (`src/components/projects/AddNewWorkDialog.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 4.1 | Category rows | Toggle buttons | Select new feature types; "Another {type}" + "already on this job" when present | Owner · Won project | | |
| 4.2 | Label (optional) per picked type | Text input | Feature label | Owner | | |
| 4.3 | "Create add-on quote (n features)" | Button | `createAddonQuote`: add-on quote + proposed features + quote sections + Cost plan sections; opens builder; disabled with nothing picked | Owner | | |
| 4.4 | Close | Dialog control | Closes; picks retained until success | Owner | | |

### 5. `/projects/:id/change-orders` — Project change orders (`src/components/views/ProjectChangeOrdersView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 5.1 | Back to project / mobile back | Link | `/projects/:id` | Owner | | |
| 5.2 | "New change order" (header, mobile, empty state) | Button | `createChangeOrder` (draft, amount 0) → builder | Owner | | |
| 5.3 | Mobile pill "n waiting on the client" | Display | Count of sent COs | Owner · mobile | | |
| 5.4 | KPI "Original contract" | Display | contract − approved changes | Owner | | |
| 5.5 | KPI "Approved changes" | Display | ± Σ approved CO amounts, colored | Owner | | |
| 5.6 | KPI "Current contract" | Display | projectContractValue | Owner | | |
| 5.7 | KPI "Waiting on client" | Display | ± Σ sent CO amounts + count | Owner | | |
| 5.8 | KPI "Schedule" | Display | Net ± days from approved COs | Owner | | |
| 5.9 | Waiting band row link | Link | Opens CO; number, title, signed amount | Owner · sent | | |
| 5.10 | Band "Copy link to resend" | Button | Copies `/change-order/:token` | Owner · sent · token | | |
| 5.11 | Band "Mark approved" | Button | ManualApprovalDialog | Owner · sent | | |
| 5.12 | CO card (left block) | Link | Number (CO-001…), title, status, reason chip, feature chips, decision line, invoiced line ("Credit — comes off…" / "Invoiced · INV (status)" / "Not invoiced yet") | Owner | | |
| 5.13 | CO card amount block | Link | Signed amount + schedule impact | Owner | | |
| 5.14 | "Finish & send" | Button link | Opens builder | Owner · draft | | |
| 5.15 | "Mark approved" | Button | ManualApprovalDialog | Owner · sent | | |
| 5.16 | "Create invoice" | Button | `createChangeOrderInvoice` (amount = CO amount) → invoice | Owner · approved · amount > 0 · no invoice yet | | |
| 5.17 | ⋯ "Open" | Menu item | Opens CO | Owner | | |
| 5.18 | ⋯ "Mark approved" | Menu item | ManualApprovalDialog | Owner · draft | | |
| 5.19 | ⋯ "Copy client link" / "Client's page" | Menu items | Copy / open share link | Owner · token | | |
| 5.20 | ⋯ "Create another invoice" | Menu item | Another invoice for the full amount | Owner · approved · amount > 0 · already invoiced | | |
| 5.21 | Empty state "Add new work" | Button link | `/projects/:id?add-new-work=1` | Owner · no COs | | |
| 5.22 | ManualApprovalDialog (as 2.2.4–2.2.9) | Dialog | `contractor_approve_change_order` — applies cost changes, schedule, contract | Owner | | |

### 6. Change order builder — `/projects/:id/change-orders/:coId` (`src/components/views/ChangeOrderWorkspace.tsx`)

#### 6.1 Header / client card

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 6.1.1 | Back link / mobile back | Link | Returns to change orders list | Owner | | |
| 6.1.2 | Title | Inline text input | CO title (draft); disabled when approved/declined | Owner · not locked | | |
| 6.1.3 | Status pill | Display | changeOrderStatusMeta | Owner | | |
| 6.1.4 | "Send for signature" | Button | Mints token, status `sent`, logs event, opens ShareLinkDialog; disabled while dirty or with no title and no items | Owner · draft · desktop only | | |
| 6.1.5 | "Decline" | Button | Opens decline AlertDialog | Owner · sent · desktop only | | |
| 6.1.6 | "Mark approved" | Button | Opens ManualApprovalDialog | Owner · sent · desktop only | | |
| 6.1.7 | "Create invoice" | Button | Invoice for the CO amount → `/invoices/:id` | Owner · approved · amount > 0 · desktop only | | |
| 6.1.8 | Client / Project cards | Display | Read-only (inherited from project) | Owner | | |
| 6.1.9 | Go to project | Link | GoToProjectLink (unsaved guard) | Owner | | |
| 6.1.10 | Link status + URL | Display | "Client link is live" / not sent yet | Owner | | |
| 6.1.11 | "Share" | Button | Mints token (no status change), ShareLinkDialog; disabled while dirty | Owner | | |
| 6.1.12 | Copy (icon) | Button | Mints token, copies URL | Owner | | |

#### 6.2 Sections and price lines

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 6.2.1 | Collapse all / Expand all | Links | As 2.6.2 | Owner | | |
| 6.2.2 | Section drag / move up / move down / collapse | Handle + buttons | As 2.6.3–2.6.5; disabled via fieldset when locked | Owner · not locked | | |
| 6.2.3 | Section name = feature picker | Combobox | Picks an existing active feature (name = feature name, cost changes on other features dropped); picking a type not on the job opens "isn't on this job" dialog | Owner · not locked | | |
| 6.2.4 | Section subtotal | Display | Σ lines (can be negative) | Owner | | |
| 6.2.5 | Delete section | Icon + AlertDialog | Removes section and its cost changes (draft) | Owner · not locked | | |
| 6.2.6 | "Scope / measurement change" | Text input | Scope note, e.g. "+100 sq ft" | Owner · not locked | | |
| 6.2.7 | Line rows (name, description, category, photos, qty, unit, "Rate ($, − for credit)", line total, drag/move/remove) | Inputs/buttons | As 2.7.x without the optional checkbox; negative totals shown red | Owner · not locked | | |
| 6.2.8 | "Add price line" | Button | New blank line | Owner · not locked | | |
| 6.2.9 | "Add a feature to change" | Button | New section | Owner · not locked | | |
| 6.2.10 | "Add new work" hint link | Link | `/projects/:id?add-new-work=1` | Owner · not locked | | |

#### 6.3 Planned cost change block (`src/components/changeOrders/CostChangesBlock.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 6.3.1 | Block header total | Display | ± Σ cost deltas of this section | Owner · feature section | | |
| 6.3.2 | "Pick the feature…" hint | Display | When section has no feature | Owner | | |
| 6.3.3 | "New line" | Button | Add-line change (material, qty 0) | Owner · not locked | | |
| 6.3.4 | "Change or remove a line" | Select | Adds edit/remove change for an existing Cost plan line (before snapshot) | Owner · not locked · unchanged lines exist | | |
| 6.3.5 | "Change labor" | Button | Labor change (defaults crew mode, 8 h/day, business default labor rate) | Owner · not locked · no labor change yet | | |
| 6.3.6 | Change row: kind tag, delta, remove (X) | Display + button | Remove change | Owner · not locked | | |
| 6.3.7 | Add-line fields: Type select, Name, Qty, Unit, Unit cost | Inputs | Non-material type defaults to lump sum qty 1 | Owner · not locked | | |
| 6.3.8 | Edit-line fields: New qty, New unit cost | Inputs | Relative to before snapshot | Owner · not locked | | |
| 6.3.9 | Labor fields (mode, crew, days, hours/day, rate, lump sum, man-hours) | Inputs | New labor block | Owner · not locked | | |

#### 6.4 Reason / notes / schedule

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 6.4.1 | Reason | Select | None + CHANGE_ORDER_REASONS | Owner · not locked | | |
| 6.4.2 | Notes for the client | Textarea | CO description (client-facing) | Owner · not locked | | |
| 6.4.3 | Schedule impact (working days) | Number input | ± days; helper text "Adds / Saves n working days" | Owner · not locked | | |

#### 6.5 Totals + Project impact

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 6.5.1 | Subtotal | Display | Σ lines | Owner | | |
| 6.5.2 | Sales tax n% | Display | subtotal × Settings sales tax % | Owner | | |
| 6.5.3 | Planned cost change / Profit on this change | Display | Only when cost changes exist | Owner | | |
| 6.5.4 | Change order total | Display | subtotal + tax; red when negative | Owner | | |
| 6.5.5 | Project impact: Original contract / Approved COs (n) / This change order / Revised contract | Display | Before vs after | Owner | | |
| 6.5.6 | Project impact: Invoiced / Paid / Remaining to bill | Display | Before vs after | Owner | | |
| 6.5.7 | Project impact: Est. cost / Margin (+ unknown-cost note) | Display | Before vs after | Owner | | |
| 6.5.8 | Project impact: Est. duration + schedule label | Display | Before vs after | Owner | | |

#### 6.6 Dialogs / save

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 6.6.1 | DraftSaveBar Discard / Save changes (+ leave guard) | Buttons | Diffs sections/items/images/cost changes; writes title/description/reason/schedule/amount; snapshots if sent | Owner · dirty | | |
| 6.6.2 | ShareLinkDialog (Copy / Text / Email) | Dialog | As 2.15.5–2.15.8, kind "change order" | Owner | | |
| 6.6.3 | ManualApprovalDialog (method / by / date / note / Mark approved) | Dialog | Approves; applies cost changes to Cost plan | Owner · sent | | |
| 6.6.4 | "{Type} isn't on this job" AlertDialog: "Keep editing" / "Add new work instead" | AlertDialog | Redirect to add-on flow | Owner | | |
| 6.6.5 | Decline AlertDialog: Reason textarea / Cancel / Decline | AlertDialog | Sets status declined, logs event | Owner · sent | | |

### 7. `/quote/:token` — Client quote page (`src/pages/SharedQuote.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 7.1 | "Quote not found" / "Loading quote…" | Display | Bad/empty token, loading | Client | | |
| 7.2 | Header: project name — Proposal, "Prepared for {client}", "Approved ✓" badge | Display | | Client | | |
| 7.3 | "Print / Save as PDF" | Button | `window.print()`; logs `pdf_downloaded` event | Client | | |
| 7.4 | Optional section "— Add to my quote" | Checkbox | Toggles section in/out of the live total (local only); logs `optional_changed`; disabled when approved | Client · not approved | | |
| 7.5 | Optional item checkbox (in required section) | Checkbox | Toggles item (local only); logs event; disabled when approved | Client · not approved | | |
| 7.6 | Line rows: name, "qty unit × $rate · description", line total, dims when unchecked | Display | | Client | | |
| 7.7 | Item photo thumbnails | Buttons | Open photo lightbox | Client | | |
| 7.8 | Photo lightbox | Dialog | Close control | Client | | |
| 7.9 | Section subtotal "(incl. your choices)" | Display | Live with toggles + selections | Client | | |
| 7.10 | Selection option cards | Radio / checkbox buttons | Pick option(s); each tap saved via `setSharedQuoteSelection`; single optional group can be un-picked; hidden for dropped optional sections; locked (only chosen shown) when approved | Client | | |
| 7.11 | Selection option photo | Button | Enlarge photo dialog | Client | | |
| 7.12 | "Please choose one" flag | Display | Required group with nothing picked/default | Client | | |
| 7.13 | Totals box: Quote total, Base (required), Optional items selected, Deposit due (n%), "Remaining balance due upon completion" | Display | Live | Client | | |
| 7.14 | Notes / Terms & conditions | Display | When set | Client | | |
| 7.15 | "Your selections" summary + Total | Display | Section · group → chosen option(s) or "Not chosen yet" | Client · not approved · has groups | | |
| 7.16 | "Please choose "X" before signing." | Display | Missing required groups | Client | | |
| 7.17 | "Your full name" | Text input | Signer name | Client · not approved | | |
| 7.18 | "Approve & sign" | Button | `sign_quote` RPC; toast; disabled without name, with missing required groups, or while a pick is saving | Client · not approved | | |
| 7.19 | Approved panel "Approved by X on date" | Display | | Client · approved | | |

### 8. `/change-order/:token` — Client change order page (`src/pages/SharedChangeOrder.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|------|------|-------------------|------------|--------|------|
| 8.1 | Not found / loading notices | Display | | Client | | |
| 8.2 | Header (project — Change Order, Prepared for, Approved ✓ / Declined badge) | Display | | Client | | |
| 8.3 | Title + description | Display | | Client | | |
| 8.4 | Section blocks: lines (qty × rate, description, signed line total), subtotal | Display | Negative shown "−$" red | Client | | |
| 8.5 | Line photos → lightbox | Buttons + dialog | | Client | | |
| 8.6 | "Change to your contract" ± amount | Display | Stored `amount` | Client | | |
| 8.7 | Schedule impact | Display | When non-zero | Client | | |
| 8.8 | "Your full name" | Text input | | Client · sent/draft | | |
| 8.9 | "Approve & sign" | Button | `signSharedChangeOrder`; disabled without name | Client · undecided | | |
| 8.10 | "Decline" | Button | Switches to decline form | Client · undecided | | |
| 8.11 | Decline reason | Textarea | Optional comment | Client · declining | | |
| 8.12 | "Back" | Button | Leaves decline form | Client · declining | | |
| 8.13 | "Confirm decline" | Button | `declineSharedChangeOrder(token, comment)` | Client · declining | | |
| 8.14 | Approved / Declined panels | Display | | Client · decided | | |
| 8.15 | "Status: Awaiting your review" footer | Display | | Client · undecided | | |

---

### Calculations

| # | Calculation | Formula (as coded) | File:line | Status | Note |
|---|-------------|--------------------|-----------|--------|------|
| C1 | Quote line total (lib) | `Number(price) * (quantity == null ? 1 : Number(quantity))` | src/lib/api.ts:1165 | | |
| C2 | Line included? | optional section or optional item → `item.client_selected`; else `true` | src/lib/api.ts:1159 | | |
| C3 | Quote total (committed) | Σ included lines + (section has groups && sectionIncluded) ? `selectionsTotal(groups)` | src/lib/api.ts:1176 | | |
| C4 | Quote committed total (SQL) | Σ `price*quantity` where `(not s.is_optional and not i.is_optional) or i.client_selected` + Σ `selection_group_price` on included sections | supabase/migrations/0115_quote_client_selections.sql (quote_committed_total) | | |
| C5 | Headline quote | originals only; most recent approved → sent → draft by created_at | src/lib/api.ts:1197 | | |
| C6 | Approved CO total | Σ `Number(co.amount)` where status = approved | src/lib/api.ts:1211 | | |
| C7 | Approved add-on total | Σ `quoteTotal` of `kind='addon' && status='approved'` | src/lib/api.ts:1234 | | |
| C8 | Project contract value | `quoteTotal(headline) + approvedAddonQuoteTotal + approvedChangeOrderTotal` | src/lib/api.ts:1226 | | |
| C9 | Deposit overdue | signed ≥ 3 days && `contractTotal * pct/100 > 0` && `paid < that` | src/lib/api.ts:1252 | | |
| C10 | Project invoice — deposit | `depositBase = quoteTotal(headline) ?? contract`; `amount = depositBase * pct/100`, rounded to cents | src/lib/api.ts:3383-3390 | | |
| C11 | Project invoice — balance | `max(0, contract − Σ all invoice amounts)` | src/lib/api.ts:3386 | | |
| C12 | Won deposit invoice (SQL) | `round(quote_committed_total * deposit_pct / 100, 2)` | supabase/migrations/0118_won_deposit_invoice_owner.sql:57-58 | | |
| C13 | CO invoice amount | `Number(co.amount)` | src/lib/api.ts:3947-3951 | | |
| C14 | Change order total (lib) | Σ `price * (quantity ?? 1)` over all sections/items | src/lib/api.ts:4108 | | |
| C15 | New quote defaults | `deposit_percentage = input ?? defaults.deposit_pct`; `overhead_rate = round(burden*100)/100` | src/lib/api.ts:2967-2970 | | |
| C16 | Builder line total | `price * quantity` | src/components/views/QuoteWorkspace.tsx:248 | | |
| C17 | Builder section base subtotal | optional section → 0; else Σ non-optional lines | src/components/views/QuoteWorkspace.tsx:256-257 | | |
| C18 | Builder section header subtotal | Σ all lines (incl. optional) + `selectionsTotal(section groups)` (no inclusion check) | src/components/views/QuoteWorkspace.tsx:981-982 | | |
| C19 | Builder base total | Σ C17 | src/components/views/QuoteWorkspace.tsx:983 | | |
| C20 | Selected add-ons total / count | Σ optional lines with `client_selected` | src/components/views/QuoteWorkspace.tsx:988-997 | | |
| C21 | Optional available total | Σ optional lines with `!client_selected` | src/components/views/QuoteWorkspace.tsx:998-1003 | | |
| C22 | Selections amount | Σ over `sectionIncluded(s)` of `selectionsTotal` | src/components/views/QuoteWorkspace.tsx:1031 | | |
| C23 | Selections cost | approved → 0; else Σ included sections' `groupCost` | src/components/views/QuoteWorkspace.tsx:1034-1035 | | |
| C24 | Selections range | `selectionRange(all included groups)` | src/components/views/QuoteWorkspace.tsx:1036 | | |
| C25 | Grand total (headline) | `baseTotal + selectedAddonsTotal + selectionsAmount` | src/components/views/QuoteWorkspace.tsx:1037 | | |
| C26 | Deposit amount (builder) | `Math.round(grandTotal * depositPct / 100)` (whole dollars) | src/components/views/QuoteWorkspace.tsx:1041 | | |
| C27 | Materials cost | no sheet → null; add-on → `sumSectionTotals(add-on feature sections, {all})`; else `costPlanTotal(materials)` | src/components/views/QuoteWorkspace.tsx:1014-1018 | | |
| C28 | Est. cost | projectId ? (materialsCost == null ? null : materialsCost + selectionsCost) : null | src/components/views/QuoteWorkspace.tsx:1053 | | |
| C29 | Profit | `grandTotal − estCost` | src/components/views/QuoteWorkspace.tsx:1099 | | |
| C30 | Margin % | `grandTotal > 0 ? profit / grandTotal * 100 : 0` (null when no cost) | src/components/views/QuoteWorkspace.tsx:1100 | | |
| C31 | Overhead rate used | stored `quote.overhead_rate` ?? current burden | src/components/views/QuoteWorkspace.tsx:1060-1061 | | |
| C32 | Can recalculate | draft && current != null && (stored == null or \|stored − current\| ≥ 0.005) | src/components/views/QuoteWorkspace.tsx:1062-1063 | | |
| C33 | Recalculate / send freeze | `overhead_rate = round(current*100)/100`, `target_margin_pct` from settings | src/components/views/QuoteWorkspace.tsx:338, 910-912 | | |
| C34 | Totals card "could range" | `grandTotal − selectionsAmount + range.min` … `+ range.max` | src/components/views/QuoteWorkspace.tsx:1529 | | |
| C35 | Section linked cost | `sumSectionTotals(linked sheet sections, {all:true}).total` | src/lib/quoteSectionMaterials.ts:64 | | |
| C36 | Section margin | `profit = price − cost`; `marginPct = price > 0 ? profit/price*100 : null` | src/lib/quoteSectionMaterials.ts:72 | | |
| C37 | Section true cost (popover) | `trueCost({direct: cost, manHours: plannedManHours(linked,{all}), rate: overheadRate ?? 0, price, target})` | src/components/views/QuoteWorkspace.tsx:2271-2272 | | |
| C38 | Linked sections | feature_id → sheet sections with that feature; manual → picked ids; auto → same job_category_id else same normalized name | src/lib/quoteSectionMaterials.ts:39-60 | | |
| C39 | Cost plan total | `sumSectionTotals(sections).total` (counted sections only; material+labor+sub+equip+other) | src/lib/costPlanMath.ts:162-176 | | |
| C40 | Cost line | material → `materialsLineTotal` (waste); other → `qty × unit_cost` | src/lib/costPlanMath.ts:74 | | |
| C41 | Annual overhead | Σ `amount × (month ? 12 : 1)` | src/lib/overhead.ts:76-79 | | |
| C42 | Productive man-hours | manual man-hours ‖ crew-days × crew × hrs/day ‖ workers × weeks × days × hrs × min(util,100)/100 | src/lib/overhead.ts:86-101 | | |
| C43 | Burden / hour | `annual / productive hours` (null if either missing) | src/lib/overhead.ts:110-115 | | |
| C44 | Planned man-hours | Σ `sectionLaborHours` (counted sections, or all) | src/lib/overhead.ts:128 | | |
| C45 | Average labor rate | Σ labor cost / Σ labor hours over sections with hours | src/lib/overhead.ts:136-141 | | |
| C46 | True cost | `overhead = manHours × rate`; `breakEven = direct + overhead`; `expected = price − direct`; `fullyLoaded = price − breakEven`; pct = `v/price*100` (null if price ≤ 0); `requiredPrice = breakEven / (1 − t/100)` for 0<t<100; `gap = price − required`; status red < 0, amber < target, else green | src/lib/overhead.ts:172-205 | | |
| C47 | Labor must sell for | `(laborRate + burden) / (1 − t/100)`; per crew-day `× crewDayHours` (24 if no settings) | src/lib/overhead.ts:209-213; src/components/overhead/TrueCostCard.tsx:68-69,109 | | |
| C48 | Valid until | `created_at + quote_validity_days × 86_400_000` | src/lib/demoData.ts:179 | | |
| C49 | Effective options | picks if any, else defaults | src/lib/selections.ts:57 | | |
| C50 | Group price | `approved_price` if set (and no override) else Σ effective `price_delta` | src/lib/selections.ts:62 | | |
| C51 | Group cost | Σ effective `cost_delta` | src/lib/selections.ts:67 | | |
| C52 | Selections total | Σ groupPrice | src/lib/selections.ts:71 | | |
| C53 | Selection range | single: required → min/max of deltas, optional → min(0,…)/max(0,…); multi: Σ negatives (+ cheapest if required & all positive) / Σ positives | src/lib/selections.ts:77-96 | | |
| C54 | Option margin impact | `price_delta − cost_delta` | src/lib/selections.ts:111 | | |
| C55 | Section included | required → true; optional → any item client_selected | src/lib/selections.ts:115 | | |
| C56 | Client quote total (lib) | Σ lines (required or client_selected) + included sections' group prices with picks override | src/lib/selections.ts:144-159 | | |
| C57 | Option price_delta from dialog | included → 0; add → `amt`; credit → `−amt` | src/components/selections/SelectionGroupDialog.tsx:158 | | |
| C58 | Client page base subtotal | Σ non-optional lines of non-optional sections | src/pages/SharedQuote.tsx:153-160 | | |
| C59 | Client page selections subtotal | Σ groupPrice(picks ?? saved) over kept sections | src/pages/SharedQuote.tsx:172-175 | | |
| C60 | Client page quote total | Σ locally-checked lines + C59 | src/pages/SharedQuote.tsx:177-183 | | |
| C61 | Client page deposit | `subtotal × deposit_percentage / 100` (unrounded) | src/pages/SharedQuote.tsx:187 | | |
| C62 | Client page "Optional items selected" | `subtotal − baseSubtotal` | src/pages/SharedQuote.tsx:275 | | |
| C63 | Client page section subtotals | optional: Σ all lines + selections; required: Σ required + checked optional + selections | src/pages/SharedQuote.tsx:412, 450 | | |
| C64 | Quick Quote price | `rate × template.quantity(answers)` | src/components/quotes/QuickQuoteFormDialog.tsx:91-93 | | |
| C65 | Line row total | `quantity × price` | src/components/common/LineItemRow.tsx:81 | | |
| C66 | Quotes list sums / avg | `sumByStatus` Σ quoteTotal by status; avg over totals > 0 | src/components/views/QuotesView.tsx:72-76 | | |
| C67 | Project quotes "Signed" | `projectContractValue(quotes, [])` | src/components/views/ProjectQuotesView.tsx:67 | | |
| C68 | Project quotes deposit | pct only if headline approved; `Math.round(total × pct) / 100` (cents) | src/components/views/ProjectQuotesView.tsx:71-73 | | |
| C69 | Quote summary by state | Σ totals of sent / drafts, rounded to cents | src/lib/projectBilling.ts:187-196 | | |
| C70 | CO builder subtotal | Σ `price × quantity` | src/components/views/ChangeOrderWorkspace.tsx:158-159, 324 | | |
| C71 | CO sales tax | `subtotal × quoteDefaults.sales_tax_pct / 100` | src/components/views/ChangeOrderWorkspace.tsx:325 | | |
| C72 | CO displayed total | `subtotal + taxAmount` | src/components/views/ChangeOrderWorkspace.tsx:326 | | |
| C73 | CO stored amount | `amount: subtotal` (no tax) on save | src/components/views/ChangeOrderWorkspace.tsx:497 | | |
| C74 | CO profit on this change | `subtotal − costDelta` | src/components/views/ChangeOrderWorkspace.tsx:906 | | |
| C75 | CO impact input | approved → `Number(amount)`; else `total` (with tax) | src/components/views/ChangeOrderWorkspace.tsx:340 | | |
| C76 | Cost change delta | add → `lineCost(line)`; remove → `−lineCost(before)`; edit → `lineCost(before∪line) − lineCost(before)`; labor → `laborCost(line) − laborCost(before)` | src/lib/changeOrderCost.ts:55-71 | | |
| C77 | Impact original contract | `quoteTotal(headline) + approvedAddonQuoteTotal` | src/lib/changeOrderImpact.ts:95 | | |
| C78 | Impact revised contract | `original + previouslyApproved + thisChangeOrder` | src/lib/changeOrderImpact.ts:102 | | |
| C79 | Impact remaining to bill | `max(0, revised − invoicedToDate)` | src/lib/changeOrderImpact.ts:106 | | |
| C80 | Impact cost before/after | plan = costPlanTotal if entries; before = applied ? plan − delta : plan; after = before + delta | src/lib/changeOrderImpact.ts:109-112 | | |
| C81 | Impact margins | before `(orig+prev − costBefore)/(orig+prev)`; after `(revised − costAfter)/revised` (×100, null if ≤ 0) | src/lib/changeOrderImpact.ts:117-122 | | |
| C82 | Impact duration after | `max(0, est + Σ approved other CO days + this CO days)` | src/lib/changeOrderImpact.ts:127-130 | | |
| C83 | CO summary | `original = r2(contract − approved)`, `current = r2(contract)`, pending Σ sent amounts, schedule Σ approved days | src/lib/projectBilling.ts:101-112 | | |
| C84 | Client CO section subtotal | Σ `price × (quantity ?? 1)` | src/pages/SharedChangeOrder.tsx:217 | | |
| C85 | Feature price | Σ approved quotes' `quoteTotal(sections of feature)` + Σ approved CO items on that feature | src/lib/featureFinancials.ts:16-31 | | |
| C86 | General price (feature report) | `max(0, Σ all approved quotes + Σ approved CO items − Σ feature prices)` | src/lib/featureFinancials.ts:117-131, 160 | | |

---

### Code observations (unverified)

All items below are from reading code only — none has been reproduced in the running app.

#### Money

1. **Client's optional-item choices on the share link are never saved.** `SharedQuote.tsx:52-57` keeps section/item checkboxes as local state ("never written to Supabase") and `signSharedQuote` (`api.ts:4900`) / `sign_quote` (0075) only send the signer's name. New optional lines default to `client_selected = true` (`QuoteWorkspace.tsx:448, 627`, same as the DB). So after signing, `quoteTotal` / `quote_committed_total` still count every optional line. The contract value and the Won deposit invoice (`0118:57-58`) then include work the client unticked. Example: base $20,000 plus a $5,000 optional line. The client unticks it and sees Quote total $20,000 and Deposit 30% = $6,000. After signing, the contract is $25,000 and the deposit invoice is $7,500. The Client Hub path persists choices (`portal_set_quote_item_selection`); the link path does not.
2. **Share page ignores the saved `client_selected` state.** On first load every optional section/item is seeded as checked (`SharedQuote.tsx:60-73`), whatever the server has. If an optional line was deselected in the Client Hub, the link shows it included. After approval the locked page still shows everything checked, so the total displayed ≠ the contract total.
3. **"Optional" figures in the builder are mislabeled.** `client_selected` defaults to true, so a fresh optional line lands in "Selected add-ons" / "Optional items (n)" and in the headline total, deposit and margin (`QuoteWorkspace.tsx:988-1003, 1037`). "+ $X in optional add-ons the client can pick" (C21) stays $0. The comment at `:251-255` says optional items should count only toward the "optional" figure, which contradicts this.
4. **Change order sales tax shows but is never charged.** The builder shows "Change order total" = subtotal + tax (`ChangeOrderWorkspace.tsx:325-326, 911-915`) but saves `amount: subtotal` (`:497`). The client page shows `co.amount` (`SharedChangeOrder.tsx:121-123`), and the contract (C6) and CO invoice (C13) use the pre-tax amount. Project impact uses the taxed total while in draft and the untaxed amount once approved (`:340`), so "Revised contract" jumps at approval. Example: $1,000 at 8% shows $1,080 to the contractor, while the client, contract and invoice all get $1,000. Tax also applies to credits (−$500 → −$540 shown). Quotes have no tax at all (`QuoteWorkspace.tsx:1024-1028`). The rate is not stored on the CO, so changing the Settings tax % re-prices every historical CO's displayed total.
5. **Change orders can be invoiced twice.** The builder's "Create invoice" (`ChangeOrderWorkspace.tsx:662-666`) never checks for existing invoices. The list's ⋯ "Create another invoice" (`ProjectChangeOrdersView.tsx:312-314`) creates another invoice for the full `amount`. Example: an approved $2,000 CO clicked twice gives two $2,000 invoices, $4,000 billed.
6. **Deposit rounding differs by screen.** Builder: `Math.round(total*pct/100)`, whole dollars (`QuoteWorkspace.tsx:1041`). Project quotes: cents (`ProjectQuotesView.tsx:73`). Client page: unrounded (`SharedQuote.tsx:187`). Invoices: cents (`api.ts:3390`, `0118:58`). Example: $12,345 × 33% shows $4,074 in the builder and $4,073.85 everywhere else.
7. **Deposit % is not clamped.** `QuoteWorkspace.tsx:1486-1496` has `max="100"` only as an HTML attribute; `parseFloat` accepts 150 or −10 and saves it. A 150% deposit on $10,000 = $15,000 deposit invoice.
8. **Margin reads 0% (green) when total is $0 and cost > 0.** `QuoteWorkspace.tsx:1100` returns 0 instead of null. Example: cost $5,000, total $0 → Profit −$5,000 next to "Margin 0%". The badge (`:1814-1823`) is always success-green, even when the margin is negative.
9. **An original quote's cost includes add-on work.** `materialsCost` for a non-add-on quote is the whole Cost plan (`QuoteWorkspace.tsx:1018`). Once an add-on is approved, its features become active and count. So the original quote's price is compared against original + add-on cost, and its margin/profit drop. Example: original $30k, cost $20k (33%). After a $10k add-on costing $7k is approved, the original shows cost $27k and margin 10%. Every "option / revision" quote is likewise compared against the same full plan.
10. **Totals card rows don't add up to the Quote total when selections exist.** `sectionRows` use `baseSubtotal` (no selections) (`QuoteWorkspace.tsx:1103-1105`), and the summary card's "Base / Optional items" breakdown also leaves selections out, while `grandTotal` includes them. Example: section $10,000 + default option +$1,250 → rows $10,000, total $11,250. The only explanation is the "could range" note, which appears only when min ≠ max.
11. **Section header subtotal includes selections of an excluded optional section.** `sectionSubtotal` (`QuoteWorkspace.tsx:981-982`) adds `selectionsTotal` with no `sectionIncluded` check, while C22 does check. This matters only when all items of an optional section are deselected.
12. **Client page lumps selections into "Optional items selected".** `subtotal − baseSubtotal` (`SharedQuote.tsx:275`) includes selection deltas. Example: no optional lines picked but a +$1,250 option → "Optional items selected $1,250" (shown only if the quote has optional items).
13. **Client page drops the frozen `approved_price`.** `clientGroupLike` (`selections.ts:133-140`) does not carry `approved_price`, so an approved quote's group price on the share page is recomputed from picks/defaults. It can diverge from the frozen contract value if options change later (e.g. via a selection change order).
14. **Multiple approved originals double-count feature prices.** Nothing prevents approving two originals: `contractor_approve_quote` accepts any draft/sent quote, including ⋯ "Mark approved" on a draft option. `projectContractValue` then uses only the most recent approved one (`api.ts:1197-1206`), while `featurePrice` / `featureReports` sum every approved quote (`featureFinancials.ts:18-21, 118-119`). Per-feature prices and "General" can then exceed the contract.
15. **Contract value moves when an approved quote is edited.** Saving an approved quote reverts it to draft (`QuoteWorkspace.tsx:690-699`). `pickHeadlineQuote` then falls back to the newest *sent* original, possibly an older option, or to this draft. Until it is re-signed, project contract value, deposit checks and CO "Original contract" shift.
16. **Change order "Original contract" can be an unsigned quote.** `changeOrderImpact.ts:95` and `changeOrderSummary` (`projectBilling.ts:106`) take `pickHeadlineQuote`, which returns a sent or draft quote when nothing is approved. `changeOrderSummary.original` also includes approved add-ons but is labeled "signed quote" (`ProjectChangeOrdersView.tsx:160`).
17. **Negative option amount flips sign.** `SelectionGroupDialog.tsx:158`: typing "−200" with "+ Add" gives −200, and with credit gives +200 (double negation). The amount input has no `min`.
18. **Negative prices allowed on quote lines.** `LineItemRow.tsx:192-203` has no min, so a quote line can be a credit, which reduces the total and deposit. This may be intended on COs but is unlabeled on quotes.
19. **Valid-until is not stored and not enforced.** It is computed from `created_at` plus the *current* Settings validity days (`demoData.ts:179`), not from `sent_at`. Changing Settings rewrites every quote's date. Example: created Jan 1, sent Mar 1, 30 days → "Valid until Jan 31" before it was sent. The client page never shows it, and `sign_quote` doesn't check it.

#### Lock bypasses / state

20. **`sign_quote` has no status check.** The only guard is `signed_at is null` (`0075:210-216`). Preview and the Share card's Share/Copy mint a token on a **draft** without sending (`QuoteWorkspace.tsx:945-975`). A client with that link can sign a draft, and the overhead-rate freeze in `shareQuoteMut` (`:909-913`) never runs. A **declined** quote also shows the sign form (`SharedQuote.tsx:305-369` renders it for any non-approved status) and can be signed.
21. **Approved-quote edit is not transactional.** Revert-to-draft plus signature clear runs first, then dozens of separate writes (`QuoteWorkspace.tsx:690-870`). A mid-save failure leaves the quote as an unsigned draft with partial edits.
22. **Sent change orders can be re-priced silently.** A `sent` CO is not `locked` (`ChangeOrderWorkspace.tsx:349`), so Save rewrites items and `amount` while the client link is live. It only snapshots (`:502`); there is no revert or notice. The client can sign a number that differs from what they were first sent.
23. **CO "Mark approved" ignores unsaved edits.** Unlike the quote (`disabledReason`), the CO Mark approved/Decline buttons are not disabled while dirty (`ChangeOrderWorkspace.tsx:651-658`). Approving records the last saved amount, not what is on screen.
24. **CO decline comment is thrown away.** The textarea (`ChangeOrderWorkspace.tsx:1030-1035`) fills `declineComment`, but `declineMut` sends only `{status:"declined"}` (`:582-590`). `declined_at` is also not set, so `changeOrderDecisionLine` shows "Declined" with no date or comment.
25. **CO builder actions are desktop-only.** Send / Decline / Mark approved / Create invoice sit only in the `hidden md:block` header (`ChangeOrderWorkspace.tsx:625-669`), and the mobile header gets no actions. On a phone a CO cannot be sent or invoiced from the builder; only the list page's buttons work.
26. **Quote delete has no confirm and no status guard.** `QuotesView.tsx:197` deletes immediately, even an approved quote, which removes the project's contract value. Whether the 0033 lock triggers block the cascade was not checked.
27. **Selections on a sent quote save instantly.** They bypass the draft/Save pattern: contractor pick, delete group (no confirm, `QuoteSectionSelections.tsx:126`) and edit group all write immediately while the client may be viewing. They are only snapshotted.

#### Client-facing leaks

28. No internal cost/margin/overhead fields found on `/quote/:token` or `/change-order/:token`. Both go through the `clientSafe.ts` whitelist, and the pages render only price/qty/unit/description/selections `price_delta`. `cost_delta`, `approved_price` and `link_*` are on `INTERNAL_FIELDS`. Worth a network-tab check anyway, since `get_shared_quote` SQL is the first line of defence.

#### Docs drift

29. CLAUDE.md says `QuoteWorkspace` reads the sales-tax % "for the sales-tax line", but the code has removed quote tax (`QuoteWorkspace.tsx:1024-1028`). Sales tax now only affects change orders (see #4).

---

## Area 06 — Invoices, payments, expenses, reports, timesheets

Scope: invoices, payments + receipts, public invoice/receipt pages, expenses, revenue + detail pages,
business health, marketing ROI, timesheets + payroll, and the money settings pages.
Source: read-only code review of `main` @ 281bf8b (2026-09-28). Status / Note columns are left empty for the tester.

Scope notes (from the code, not verified live):
- **`/invoices/new` does not exist.** No route in `src/App.tsx`; "+ New invoice" on `/invoices` creates a blank draft (`createInvoice()`) and navigates to `/invoices/:id`.
- **Stripe is not implemented.** No `stripe` string anywhere in `src/` or `supabase/`. The public invoice page says "Online payment coming soon" (`src/pages/SharedInvoice.tsx:144`). `/settings/billing` and `/settings/invoicing` are static placeholders with nothing saved.
- **No receipt scan on Expenses.** The only receipt scan is on the project Material orders page (`ProjectMaterialOrdersView.tsx:117`, the "log a delivery" flow), which is outside this area. `/expenses` and `/projects/:id/expenses` have no upload or scan.
- Marketing ROI lives inside the Pipeline page (`PipelineView` → `LeadSourceReport`), not on a page of its own.
- The crew-side time clock is `/employee/time` (`EmployeeTimeView`). It's listed briefly for completeness.

Roles: **Owner** = the signed-in contractor (every page below is owner-only unless marked). **Public** = anyone holding a token link, with no login. **Crew** = an employee login.

---

### 1. `/invoices` — Invoices list (`src/components/views/InvoicesView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 1.1 | Header subtitle "Outstanding $X · N over 30 days" | Display | Shows the live AR total (sent + overdue balances) and the count of invoices more than 30 days late | Owner; always | | |
| 1.2 | "+ New invoice" (desktop) / "+ New" (mobile header) | Button | Creates a blank standalone draft (amount 0, INV-00n among standalone invoices) and opens it | Disabled while it's creating; toast on error | | |
| 1.3 | KPI "Current" | Card | Balance of sent/overdue invoices that aren't past due, plus the "N due soon" count | Desktop only (md+) | | |
| 1.4 | KPI "1–30 days" | Card | Balance 1–30 days past due, with count | Desktop only | | |
| 1.5 | KPI "31–60 days" | Card | Label says 31–60, but the value adds the 31–60 **and** 60+ buckets. Red sub-text when > 0 | Desktop only | | |
| 1.6 | KPI "Received, last 30 days" | Card | Active payments whose paid_on falls in the last 31 calendar days, with count | Desktop only | | |
| 1.7 | Filter segment: All / Unpaid / Draft / Shared / Overdue / Paid, each with a count | Segmented control | Filters the list. "Unpaid" = sent + overdue. Pre-selected from `?filter=` | Desktop (FilterSegment); mobile uses 1.8 | | |
| 1.8 | Filter pills (same options) | Pills | Same as 1.7 on mobile | Mobile only | | |
| 1.9 | Search "Search invoices or jobs" | Text input | Matches invoice number, project name or client name (case-insensitive) | Desktop inline; mobile inside the header | | |
| 1.10 | Table row (Invoice · Job/client · Amount · Status · Due) | Row link | Opens `/invoices/:id` | Desktop | | |
| 1.11 | Amount cell "$X due" sub-line | Display | Shows the remaining balance when the invoice is partially paid | Only when partial | | |
| 1.12 | Status cell | Pill | "N days late" (red) when past due, else the status pill (Draft / Shared / Partially paid / Paid / Overdue) | — | | |
| 1.13 | Row ⋯ menu → "Open project" | Menu item | Goes to `/projects/:id` | Only if the invoice has a project | | |
| 1.14 | Row ⋯ menu → "Delete" | Menu item (destructive) | Deletes the invoice. **No confirmation.** Applied payment allocations cascade away and that money becomes project credit | Always shown, even on paid invoices | | |
| 1.15 | Mobile ListCard (eyebrow = number · late/status, right = amount or "bal of amt") | Card link | Opens `/invoices/:id`; the left border colour follows status or late | Mobile | | |
| 1.16 | Loading / error / empty states | Text | "Loading invoices…", "Failed to load invoices: …", "No invoices here." | — | | |

### 2. `/invoices/:invoiceId` and `/projects/:id/invoices/:invoiceId` — Invoice workspace (`InvoiceWorkspace.tsx`, wrappers `InvoiceDetailView.tsx`, `ProjectInvoiceDetailView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 2.1 | Back link ("Back to invoices") | Link | `/invoices` or `/projects/:id/invoices`, depending on the route | Desktop BackLink; mobile header back | | |
| 2.2 | Title + status pill / "N days late" badge | Display | Invoice number with its status. The late badge replaces the pill when past due | — | | |
| 2.3 | Subtitle "Due YYYY-MM-DD · bills $A of the $B contract" | Display | Contract = projectContractValue (quote + add-ons + approved COs), or the quote total when standalone | Contract part only when > 0 | | |
| 2.4 | Mobile header pills (late / status, "Due …") | Display | Same info, on mobile | Mobile | | |
| 2.5 | Client pill | Link | Opens `/clients/:id` | Only when the project has a client; otherwise a static "?" pill | | |
| 2.6 | Project pill | Link (GoToProjectLink overlay) | Opens the project, with an unsaved-changes guard (`isDirty`) | Project-linked invoice | | |
| 2.7 | "Link a project" select (No project / project list) | Select | Links a standalone invoice to a project and sets quote_id to that project's headline quote. The invoice number is **not** renumbered | Standalone only; disabled while pending | | |
| 2.8 | Client-link strip ("Client link is live" / "Paid — link still works" / "Not sent yet") | Display | Shows the share URL, or a placeholder | — | | |
| 2.9 | "Share link" | Button | Opens ShareLinkDialog with the existing link | Only when share_token exists | | |
| 2.10 | "View as client" (external icon) | Link | Opens `/invoice/:token` in a new tab | Only when share_token exists | | |
| 2.11 | Timeline Draft → Sent → Viewed → Paid | Display | Each step is ticked with its "time ago". Sent uses the invoice_sent event; Viewed uses viewed_at; Paid uses status + paid_at | — | | |
| 2.12 | "N days past due" banner | Display | Red banner under the timeline | Late and not paid | | |
| 2.13 | Line-items header ("N lines" / "Single amount", draft total) | Display | Live draft total | — | | |
| 2.14 | Amount input ($) | Number input | The single invoice amount (a draft field until Save) | Not itemised; disabled when paid | | |
| 2.15 | Line description input | Text input | Per line | Itemised; disabled when paid | | |
| 2.16 | Line quantity input | Number input (step any) | Per line | Disabled when paid | | |
| 2.17 | Line unit price input ($) | Number input | Per line | Disabled when paid | | |
| 2.18 | Line total | Display | qty × unit price | — | | |
| 2.19 | Remove line (trash) | Icon button | Removes the line from the draft | Disabled when paid | | |
| 2.20 | "Itemize this invoice" / "Add line item" | Button | The first click turns the current amount into line 1; after that it adds a blank line | Hidden when paid | | |
| 2.21 | "Add lines from quote" / "Replace with quote lines" | Button | Replaces the draft lines with the source quote's **included** items (qty × price). Selection-group prices are not copied | Only when a source quote with sections exists; hidden when paid | | |
| 2.22 | Billable-extra buttons "Add-on quote #n · $X" / "Change order #CO-00n — title · $X" | Buttons | Append that approved add-on or CO as a line. When the invoice wasn't itemised, the current amount becomes line 1 first | One per approved add-on / CO; hidden when paid | | |
| 2.23 | Due date | Date input | Draft field | Stays editable even when paid | | |
| 2.24 | Notes | Auto-grow textarea | Draft field; also shown to the client | Stays editable even when paid | | |
| 2.25 | "Balance due" headline + status pill | Display | invoiceBalance | — | | |
| 2.26 | MoneyRows: Invoice total / Payments applied / Balance due | Display | amount, invoicePaid, balance | — | | |
| 2.27 | "Paid <date>" | Display | paid_at | Paid only | | |
| 2.28 | "Send invoice" | Button (primary) | Generates the share token, sets status to sent, optionally applies credit (2.29), logs invoice_sent, then opens ShareLinkDialog | Draft only; disabled while dirty or pending ("Preparing…") | | |
| 2.29 | "Apply $X project credit when this invoice is sent" | Checkbox (default on) | On send, applies min(credit, balance) through applyProjectCredit | Draft with project credit > 0 | | |
| 2.30 | "Apply $X credit" | Button | Applies min(project credit, balance) to this invoice right away | Sent/overdue with credit; disabled while dirty | | |
| 2.31 | "Record payment" | Button (primary) | Opens RecordPaymentSheet with this invoice pre-applied at its balance | Sent/overdue; disabled while dirty | | |
| 2.32 | "Share link" (right rail) | Button | Re-runs shareMut (returns the existing token) and opens ShareLinkDialog | Sent/overdue | | |
| 2.33 | "Paid in full — nothing left to collect." / "Save your changes first." | Helper text | — | Paid / dirty | | |
| 2.34 | Payments card (PaymentsList) | List | Payments with any allocation to this invoice. See §5 | Only when at least one exists | | |
| 2.35 | History card | List | project_events whose meta.invoice_id matches; "Nothing yet." when empty | — | | |
| 2.36 | DraftSaveBar: Discard / Save changes | Bar | Save writes due date + notes, then replaces invoice_items and writes amount = Σ lines (or the single amount). After save of a non-draft, snapshots a document version | Visible while dirty | | |
| 2.37 | ShareLinkDialog (kind invoice) | Dialog | Copy / share the client URL | After Send or Share | | |
| 2.38 | Loading / error states | Text | "Loading invoice…", "Failed to load invoice: …". On the project route it can show the error while the project query is still loading | — | | |

### 3. `/projects/:id/invoices` — Project invoices (`ProjectInvoicesView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 3.1 | Back to project | Link | `/projects/:id` | Desktop BackLink / mobile header back | | |
| 3.2 | "N of M paid" pill | Display | Among non-draft invoices | When any are non-draft | | |
| 3.3 | "Record payment" (desktop) / "Payment" (mobile) | Button | Opens RecordPaymentSheet with nothing pre-applied (unallocated credit by default) | **Disabled when every invoice is a draft, and also when there are no invoices at all** | | |
| 3.4 | "New invoice ▾" menu → "Deposit (from the quote's deposit %)" | Menu item | createProjectInvoice("deposit") then opens the new draft | Hidden once a deposit invoice exists (notes = "Deposit") | | |
| 3.5 | "New invoice ▾" → "Remaining balance · $X" | Menu item | createProjectInvoice("balance"). The label amount = contract − non-draft invoiced, but the created amount = contract − **all** invoiced (drafts included) | Disabled while creating | | |
| 3.6 | KPI Contract | Card | projectContractValue; sub "incl. change orders" / "signed quote" | — | | |
| 3.7 | KPI Invoiced | Card | Σ non-draft invoices, with "% of contract" | — | | |
| 3.8 | KPI Collected | Card | Σ active payments; "% of contract" or "$X overpaid" | — | | |
| 3.9 | KPI Outstanding | Card | Σ unpaid balances on non-draft invoices; "N late" | — | | |
| 3.10 | KPI Not invoiced yet | Card | max(0, contract − invoiced) | — | | |
| 3.11 | Collected / invoiced progress bar | Display | Two stacked widths, each capped at 100% | Contract > 0 | | |
| 3.12 | "Needs attention" list rows (late / opened not paid / sent not opened) | Links | Open the invoice; show why and the balance due | When any apply | | |
| 3.13 | "Copy link to resend" | Button | Copies `/invoice/:token` to the clipboard; toast | Needs-attention row with a token | | |
| 3.14 | "Record payment" (needs-attention row) | Button | Sheet pre-applied to that invoice | — | | |
| 3.15 | Invoice card (number, kind chip Deposit / Change order CO-00n / Progress / balance, status pill, timing, client step) | Link | Opens the invoice | — | | |
| 3.16 | Amount + "$X left" + paid progress bar | Display | paid / amount | — | | |
| 3.17 | "Finish & send" | Button link | Opens the draft | Draft rows | | |
| 3.18 | "Record payment" (row) | Button | Sheet pre-applied | Non-draft with balance > 0 | | |
| 3.19 | Row ⋯ → Open | Menu item | Navigate | — | | |
| 3.20 | Row ⋯ → Copy client link | Menu item | Clipboard | Has token | | |
| 3.21 | Row ⋯ → Client's page (print / PDF) | Menu item | Opens the public page in a new tab | Has token | | |
| 3.22 | Empty state "No invoices yet…" + New invoice menu | Empty | — | No invoices | | |
| 3.23 | Payments card "$X received" + PaymentsList | List | Every project payment, including voided ones | — | | |
| 3.24 | Loading / error | Text | "Loading invoices…" / "Failed to load invoices". The error shows while the project query is still pending | — | | |

### 4. RecordPaymentSheet — record / edit a payment (`src/components/payments/RecordPaymentSheet.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 4.1 | Container | Bottom Sheet (mobile) / Dialog (desktop) | Title "Record payment" or "Edit payment R-000n" | — | | |
| 4.2 | Amount ($) | Text input (decimal) | Parsed after stripping $ , and spaces, rounded to cents. Pre-filled with the invoice balance when opened from an invoice | Autofocus on create | | |
| 4.3 | Date received | Date input | Defaults to today (local) | — | | |
| 4.4 | Method pills (Check / Cash / Card / ACH / Zelle / Venmo / Other) | Toggle buttons (aria-pressed) | Default Check | — | | |
| 4.5 | "Check #" / "Reference" | Text input | The label switches with the method; numeric keyboard for Check | — | | |
| 4.6 | Note ("Internal — not on the receipt") | Textarea | — | — | | |
| 4.7 | "Apply to invoice" | Checkbox | Shows per-invoice allocation inputs | Disabled with "· no open invoices" when no candidates | | |
| 4.8 | Per-invoice "Apply to INV-00n" + "$X open" | Text input per row | Allocation amount. Candidates = non-draft invoices with balance (+ this payment's own allocation when editing), oldest first | applyOn | | |
| 4.9 | "Fill oldest first" | Link button | Suggests allocations filling the oldest invoice first, up to the amount | Disabled when amount ≤ 0 | | |
| 4.10 | "$X stays as project credit" / "$X over" | Display | Amount minus Σ allocations | applyOn | | |
| 4.11 | "Not applied — $X stays as project credit." | Helper | — | applyOn off, amount > 0, has project | | |
| 4.12 | Validation message | Text | "Enter an amount" / "Pick a date" / "Applied $X is more than the payment" / "An amount is more than that invoice's balance" | Shown only when amount > 0 | | |
| 4.13 | Cancel | Button | Closes | — | | |
| 4.14 | "Record $X" / "Save changes" | Submit | Create: createPayment + allocations (DB assigns R-000n). Edit: when shrinking, set allocations first, then patch the payment; when growing, patch first, then allocations. Toast "Receipt created" | Disabled on error / pending | | |

### 5. PaymentsList — payment rows, ⋯ menu, void / history / send dialogs (`src/components/payments/PaymentsList.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 5.1 | Row: amount, date, method + ref, "applied to" label, receipt number | Display | Voided rows are struck through with a VOID badge and "Void: reason" | — | | |
| 5.2 | Receipt number link | Link | Opens `/receipt/:token` in a new tab | — | | |
| 5.3 | ⋯ → View receipt | Menu item | Same as 5.2 | — | | |
| 5.4 | ⋯ → Download PDF | Menu item | Fetches get_shared_receipt, then builds the PDF (receiptPdf.ts); toast on failure | — | | |
| 5.5 | ⋯ → Send receipt | Menu item | ShareLinkDialog (kind receipt) with the receipt URL | — | | |
| 5.6 | ⋯ → Edit | Menu item | Opens RecordPaymentSheet in edit mode | Active payments only | | |
| 5.7 | ⋯ → History | Menu item | PaymentHistoryDialog: audit events (created / edited from→to / applied / unapplied / voided / restored / migrated), each with You / Team member / System | — | | |
| 5.8 | ⋯ → Void | Menu item (destructive) | Opens the void dialog | Active payments only | | |
| 5.9 | ⋯ → Restore | Menu item | Sets status active again **immediately, with no confirmation**. Its old allocations become active again | Void payments only | | |
| 5.10 | Void dialog: Reason textarea | Textarea | Optional reason | — | | |
| 5.11 | Void dialog: Cancel / "Void payment" | Buttons | Voids; logs payment_voided. Toast "It stays in the list, crossed out…" | Disabled while pending | | |
| 5.12 | History dialog loading / empty | Text | "Loading…" / "No history recorded." | — | | |
| 5.13 | Empty list | Text | "No payments yet." (or the caller's emptyLabel) | — | | |

### 6. `/invoice/:token` — Public invoice (`src/pages/SharedInvoice.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 6.1 | "Paid ✓" banner | Display | — | Public; status paid | | |
| 6.2 | Brand line | Display | Hard-coded "ContractorPro", **not** the contractor's company name | — | | |
| 6.3 | Title "{project} — Invoice INV-00n", "Prepared for {client}" | Display | — | — | | |
| 6.4 | Amount box: "Amount due" / "Balance due" (partial) / "Invoice total" (paid); "$A invoice · $P paid"; "Due {date}" | Display | balance = max(0, amount − amount_paid) | — | | |
| 6.5 | Details list (description, qty × unit, line total) | Display | Itemised invoices only | — | | |
| 6.6 | Notes | Display | pre-wrap | When notes exist | | |
| 6.7 | Footer: "Paid on … Thank you!" / "To pay by bank transfer, contact your contractor. Online payment coming soon." | Display | No pay button. Stripe is not implemented | — | | |
| 6.8 | Mark viewed | Side effect | Calls mark_invoice_viewed once the page has loaded a non-draft invoice | — | | |
| 6.9 | Loading / not found | Text | "Loading invoice…" / "Invoice not found." | — | | |

### 7. `/receipt/:token` — Public receipt (`src/pages/SharedReceipt.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 7.1 | VOID banner | Display | "This payment was voided and is not counted." | Public; void | | |
| 7.2 | Business block (company name, address, phone · email, license) | Display | — | — | | |
| 7.3 | Receipt number + amount (struck through if void) + "Received {date}" | Display | — | — | | |
| 7.4 | Rows: Client, Project, Address, Method, Check # / Reference, Applied to | Display | — | — | | |
| 7.5 | "Remaining project balance" | Display | max(0, remaining_balance) from the RPC | Not void, has project | | |
| 7.6 | "Download PDF" | Button | Client-side PDF | — | | |
| 7.7 | Loading / not found | Text | — | — | | |

### 8. `/expenses` — All expenses (`ExpensesView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 8.1 | Header "$X total" | Display | Σ amount of every expense (ignores the filter) | — | | |
| 8.2 | KPI Total expenses | Card | Same as 8.1 | Desktop | | |
| 8.3 | KPI Last 30 days | Card | Σ expenses whose date is ≤ 30 days ago. Undated expenses are excluded; **future-dated ones are included** | Desktop | | |
| 8.4 | Category filter (All / each category / Uncategorized, with counts) | Segment (desktop) / pills (mobile) | Split expenses count under every category they touch | — | | |
| 8.5 | Search "Search expenses or jobs" | Input | Name or project name | — | | |
| 8.6 | Table row click | Row link | Opens `/projects/:id/expenses` | Desktop | | |
| 8.7 | Category pill (Select: Uncategorized / categories / "Split across categories…") | Select | Recategorises right away, or opens the split dialog | Non-split expenses | | |
| 8.8 | "Split · N categories" pill | Button | Opens the split dialog | Split expenses | | |
| 8.9 | Inline date | Date input | Saves on **every change**; no debounce, no undo | Desktop table | | |
| 8.10 | Amount cell ("of $total" under a split share) | Display | Shows the category share when filtered | — | | |
| 8.11 | Row ⋯ → Open project | Menu item | — | Has project | | |
| 8.12 | Row ⋯ → Delete | Menu item | Deletes **without confirmation** (the project page uses an AlertDialog for the same action) | — | | |
| 8.13 | Mobile ListCard | Card link | Eyebrow is the category or "Split · N lines" | Mobile | | |
| 8.14 | Loading / error / empty | Text | — | — | | |
| 8.15 | Receipt scan | — | Not present on this page (see scope notes) | — | | |

### 9. `/projects/:id/expenses` — Project expenses (`ProjectExpensesView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 9.1 | Back to project | Link | — | — | | |
| 9.2 | Add: Name | Input | Required | — | | |
| 9.3 | Add: Amount ($) | Number input | Required and must parse. **Negatives and 0 are allowed** | — | | |
| 9.4 | Add: Date | Date input | Optional | — | | |
| 9.5 | Add: Category (optional) | Select | Uncategorized / expense categories | — | | |
| 9.6 | Add: Feature | FeatureSelect | General / the project's active features | — | | |
| 9.7 | Add: Cost type | CostTypeSelect | Defaults to the category's bucket | — | | |
| 9.8 | Save | Button | createExpense, log expense_logged, reset the form | Disabled until valid / while pending ("Saving…") | | |
| 9.9 | Row: name, amount | Display | — | — | | |
| 9.10 | Row: category pill / split pill | Select / Button | Same as 8.7 / 8.8 | — | | |
| 9.11 | Row: inline date | Date input | Saves on change | — | | |
| 9.12 | Row: delete (trash) → AlertDialog "Delete "{name}"?" Cancel / Delete | Icon button + dialog | Deletes | — | | |
| 9.13 | Row: Feature select | Select | Saves right away | Non-split | | |
| 9.14 | Row: Cost type select | Select | Saves right away | Non-split | | |
| 9.15 | "Split — feature and type are set per line." | Helper | — | Split | | |
| 9.16 | Total footer | Display | Σ amounts | — | | |
| 9.17 | Loading / error / empty "No expenses logged yet…" | Text | — | — | | |

### 10. ExpenseSplitDialog (`src/components/expenses/ExpenseSplitDialog.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 10.1 | Per-line Category | Select | — | — | | |
| 10.2 | Per-line Amount | Input | — | — | | |
| 10.3 | Per-line remove | Icon button | — | — | | |
| 10.4 | Per-line Description | Input | — | — | | |
| 10.5 | Per-line Feature / Cost type | Selects | Only when features are passed (project page) | Project page only | | |
| 10.6 | "Add line" | Button | — | — | | |
| 10.7 | Allocation meter "Balanced" / "$X left" / "$X over" + bar | Display | splitAllocation | — | | |
| 10.8 | "Put the remaining $X in the last line" / "Take $X off the last line" | Link button | — | Unbalanced | | |
| 10.9 | Cancel | Button | — | — | | |
| 10.10 | "Save split" / "Save anyway" / "Saving…" | Button | saveExpenseLines. **Saving while unbalanced is allowed** | — | | |

### 11. `/revenue` — Revenue overview (`RevenueView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 11.1 | Header subtitle "$X invoiced · $Y collected · $Z outstanding" (mobile omits collected) | Display | All-time invoiced (non-draft), all-time collected, live outstanding | — | | |
| 11.2 | KPI "This month · invoiced" | Card link | → `/revenue/invoiced` | — | | |
| 11.3 | KPI "Collected" (this month) + "$X outstanding" | Card link | → `/revenue/collected` | — | | |
| 11.4 | KPI "Avg. margin · last 12 months" | Card link | → `/revenue/margin` | — | | |
| 11.5 | KPI "Avg. job · N closed" | Card link | → `/revenue/jobs` | — | | |
| 11.6 | "Invoiced by month" bar chart (Billed / Paid) with tooltip | Card link | → `/revenue/monthly`. "Paid" = amount_paid on invoices **created** that month, not payments dated that month | Last 12 months | | |
| 11.7 | "Revenue by category" top 6 with % bars | Card link | → `/revenue/categories`. Collected basis | — | | |
| 11.8 | "Revenue by client" top 6 with % bars | Card link | → `/revenue/clients` | — | | |
| 11.9 | Loading / empty | Text | "Loading…" (invoices query only); "No collected revenue in the last 12 months yet." No error state | — | | |

### 12. Revenue detail pages — shared header (`RevenueDetailHeader.tsx`, `DateRangeSelect.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 12.1 | "Revenue" back link | Link | `/revenue` | — | | |
| 12.2 | Range select (This month / Last 3 months / Last 12 months / Year to date / Custom) | Select | Drives the page's range | Default differs per page | | |
| 12.3 | Custom start date | Date input | Inclusive | Custom | | |
| 12.4 | Custom end date | Date input | Inclusive. **No check that start ≤ end** | Custom | | |

### 13. `/revenue/invoiced` (`RevenueInvoicedView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 13.1 | KPI Invoiced (non-draft, in range) + date label | Card | — | Default This month; `?month=YYYY-MM` sets a custom range | | |
| 13.2 | KPI Invoices count | Card | Non-draft count | — | | |
| 13.3 | Status filter (All / Draft / Shared / Paid / Overdue) | Select | The list includes drafts | — | | |
| 13.4 | Client filter | Select | Client names in range, plus "No client" | — | | |
| 13.5 | Search | Input | Number / project / client | — | | |
| 13.6 | Sortable headers: Invoice, Client, Project, Date issued, Amount, Status | SortableTh | Toggle asc/desc | — | | |
| 13.7 | Row | Row link | `/invoices/:id` | — | | |
| 13.8 | Loading / empty "No invoices in this range." | Text | — | — | | |

### 14. `/revenue/collected` (`RevenueCollectedView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 14.1 | KPI Collected (range) | Card | — | Default This month | | |
| 14.2 | KPI Outstanding "as of today" | Card | Not range-scoped | — | | |
| 14.3 | KPI Collection rate | Card | collected ÷ invoiced in range, rounded; "—" when nothing was invoiced | — | | |
| 14.4 | Payments received table (Date, Client, Method, Applied to, Amount) | Table | Row click → `/projects/:id` when the payment has a project | — | | |
| 14.5 | Aging tiles Current / 1–30 / 31–60 / 60+ | Display | 31–60 and 60+ shown red | — | | |
| 14.6 | Outstanding table (Client, Invoice, Due, Balance, Age) | Table | Sorted most late first; row → `/invoices/:id` | — | | |
| 14.7 | Loading / empty states | Text | — | — | | |

### 15. `/revenue/margin` (`RevenueMarginView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 15.1 | KPI Avg. margin | Card | Unweighted mean of per-job rounded margin % | Default Last 12 months | | |
| 15.2 | KPI Jobs included | Card | Jobs with a known cost | — | | |
| 15.3 | KPI Jobs excluded | Card | Cost unknown | — | | |
| 15.4 | Sortable table: Project, Client, Revenue, Est. cost, Profit, Margin % | Table | Row → project. "Est. cost" is actually actual expenses when any exist | — | | |
| 15.5 | Margin by category | List | Revenue-weighted (Σ profit ÷ Σ revenue) | — | | |
| 15.6 | Margin by month | List | Revenue-weighted, by the jobDate month | — | | |
| 15.7 | Loading / empty | Text | — | — | | |

### 16. `/revenue/jobs` (`RevenueJobsView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 16.1 | KPIs Average / Median / Largest / Smallest | Cards | Closed jobs (collected ≥ contract) with jobDate in range | Default Last 12 months | | |
| 16.2 | Sortable table: Project, Client, Category, Value, Completed | Table | "Completed" shows jobDate (actual end, else scheduled end, else created_at) | — | | |
| 16.3 | Size distribution (Under $5k / $5k–15k / $15k–30k / $30k+) | Bars | — | — | | |
| 16.4 | Average by category | List | — | — | | |
| 16.5 | Loading / empty | Text | — | — | | |

### 17. `/revenue/monthly` (`RevenueMonthlyView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 17.1 | KPI Invoiced (range) | Card | — | Default Last 12 months | | |
| 17.2 | KPI Collected (range, by payment date) | Card | Different basis from the chart's "Paid" bars | — | | |
| 17.3 | "Compare to last year" | Switch | Adds a "Billed, last year" bar series | Only after ≥ 365 days of invoice history | | |
| 17.4 | Bar chart (Billed, Paid); clicking a bar | Chart | → `/revenue/invoiced?month=YYYY-MM` | — | | |
| 17.5 | Table rows Month / Invoiced / Collected / Outstanding / Invoices | Row link | Same drill-down | — | | |
| 17.6 | Loading / empty | Text | — | — | | |

### 18. `/revenue/categories` (`RevenueCategoriesView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 18.1 | KPI Collected (range) | Card | — | Default Last 12 months (verify) | | |
| 18.2 | KPI Categories count "incl. Uncategorized" | Card | — | — | | |
| 18.3 | Explainer text | Display | — | — | | |
| 18.4 | Sortable table: Category, Revenue, Jobs, Avg. job value, Margin % | Table | Clicking a row toggles "selected" | — | | |
| 18.5 | "{Category} jobs" panel (Project, Client, Value, Status pill) | Table | Row → project | When a row is selected | | |
| 18.6 | Loading / empty | Text | — | — | | |

### 19. `/revenue/clients` (`RevenueClientsView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 19.1 | KPI Collected (range) | Card | Includes payments with no project or client, which have no row below | Default Last 12 months | | |
| 19.2 | KPI Clients "N of M total" | Card | — | — | | |
| 19.3 | Search clients | Input | — | — | | |
| 19.4 | Sortable table: Client, Revenue, Share, Jobs, Outstanding, Last job | Table | Row → `/clients/:id` | — | | |
| 19.5 | Loading / empty | Text | — | — | | |

### 20. `/business-health` (`src/components/health/BusinessHealthView.tsx`, `useBusinessHealth.ts`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 20.1 | Headline card "Booked through" (+ ⓘ tip) | Button → records dialog | Per-crew booked-through dates | Owner | | |
| 20.2 | Headline "Backlog" $ + crew-weeks | Button → dialog | Unscheduled jobs plus crew-assigned scheduled jobs | — | | |
| 20.3 | Headline "Next 30 days in" + net | Button → dialog | Lines in period 1 | — | | |
| 20.4 | Headline "Overdue" + count | Button → dialog | Aging buckets 1–30 and older | — | | |
| 20.5 | Headline "Booked this month" + change vs last year | Button → dialog | This month / last month / same month last year | — | | |
| 20.6 | Headline "Avg margin" (+ fully loaded) | Button → dialog | Completed jobs in the selected period | — | | |
| 20.7 | ⓘ Tip icons | Tooltip | Explain each figure | — | | |
| 20.8 | Section collapse chevrons (Backlog & capacity, Cash forecast, Accounts receivable, Sales & revenue trends, Profitability) | Toggle buttons | State kept in localStorage `business-health-sections` | — | | |
| 20.9 | Per-crew capacity cards (4 / 8 / 12-week utilisation, 12-week strip) | Display | — | When crews exist; otherwise a Settings hint | | |
| 20.10 | Unscheduled-job rows | Links | → project | — | | |
| 20.11 | Cash period tiles (30 / 60 / 90) | Buttons → dialog "Days a–b in" | Line breakdown | — | | |
| 20.12 | AR bucket tiles (Current / 1–30 / 31–60 / 61–90 / 90+) | Buttons → dialog | Disabled when the bucket is empty; rows → `/invoices/:id` | — | | |
| 20.13 | Top overdue clients list | Display | — | — | | |
| 20.14 | Trends: Booked / Collected this month / last month / YTD with ▲▼ % | Display | — | — | | |
| 20.15 | Pipeline by stage (count, probability, value, weighted) | Display | — | — | | |
| 20.16 | Win rate · last 90 days vs prior 90 | Display | — | — | | |
| 20.17 | "Revenue by category" link | Link | → `/revenue/categories` | — | | |
| 20.18 | Best / worst job links | Links | → project | — | | |
| 20.19 | Estimating insights / Pipeline links | Links | — | — | | |
| 20.20 | Profitability period select (This month / Last 3 / Last 12 / YTD) | Select | Default YTD | — | | |
| 20.21 | Settings link "payment terms, pipeline probabilities, holidays, crew working days" | Link | → `/settings/business-health` | — | | |
| 20.22 | Records dialog (title, note, rows with optional links) | Dialog | — | — | | |
| 20.23 | Loading | Text | "Loading…" is gated on the projects query only. No error state | — | | |

### 21. `/settings/business-health` (`SettingsBusinessHealthView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 21.1 | "Clients pay invoices within N days" | Numeric input (floors to int) | 0–120 is valid | Renders nothing (blank) until settings load | | |
| 21.2 | Stage probability inputs (one per stage, %) | Numeric inputs | Clamped to 0–100 | — | | |
| 21.3 | Save | Button | Disabled when invalid, pending or unchanged | — | | |
| 21.4 | Crew working-day toggles Sun–Sat | Toggle buttons | Save **on every click**. With all days off, capacity silently falls back to Mon–Fri | — | | |
| 21.5 | "New crew" input + Add | Input + button | saveCrew | — | | |
| 21.6 | Holiday list with remove (trash) | List + icon button | Upcoming only; deletes with no confirmation | — | | |
| 21.7 | Holiday date + name + Add | Inputs + button | — | — | | |

### 22. Marketing ROI — Pipeline › Lead source report (`src/components/marketing/LeadSourceReport.tsx`, `SpendDialogs.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 22.1 | Period select (This month / Last month / Last 3 / Last 6 / Last 12 / YTD / Custom…) | Select | Default Last 12 | Owner | | |
| 22.2 | Custom from / to | Month inputs | A reversed range is swapped automatically | Custom | | |
| 22.3 | ⓘ "How this is counted" | Tooltip | — | — | | |
| 22.4 | "Edit spend" | Button | Opens SpendGridDialog | Desktop | | |
| 22.5 | "Add spend" | Button | Opens SpendFormDialog (pick a source) | Mobile | | |
| 22.6 | "Still open: N leads…" banner | Display | — | When open leads exist | | |
| 22.7 | Type-filter note | Display | Spend isn't split by job type | When the pipeline is type-filtered | | |
| 22.8 | Overhead mismatch banner + "Update overhead?" link | Display / link | Shown when off by ≥ 25% and ≥ $500 | — | | |
| 22.9 | Sortable desktop table (13 cols incl. Fully loaded profit when overhead is set) | Table | Row click opens the detail dialog; the "free" tag appears on unpaid sources | Desktop | | |
| 22.10 | Mobile source cards | Buttons | Detail dialog | Mobile | | |
| 22.11 | "All sources" totals block | Display | Blended | — | | |
| 22.12 | "Spend vs won revenue" chart | Chart | — | — | | |
| 22.13 | "Cost per lead by month" chart | Chart | Top 6 paid sources | — | | |
| 22.14 | Detail dialog: lead list links → `/pipeline/:id`; "Enter spend" button | Dialog | Opens SpendFormDialog for that source | — | | |
| 22.15 | SpendGridDialog: cell per source × month | Inputs | Empty cell = no spend. The row total is live | — | | |
| 22.16 | SpendGridDialog: Cancel / Save | Buttons | Upserts changed cells. **The upsert sends note = null, which wipes any existing note** | Disabled when unchanged or invalid | | |
| 22.17 | SpendFormDialog: Source select, Month, Amount, Note | Inputs | — | — | | |
| 22.18 | SpendFormDialog: Save / Remove | Button | Clearing an existing amount turns the button into Remove (delete) | — | | |
| 22.19 | SpendFormDialog: month history list | Buttons | Loads that month into the form | Source picked | | |
| 22.20 | Empty "No leads or spend in this period." | Text | — | — | | |

### 23. `/timesheets` — Timesheets (`src/components/timesheets/TimesheetsView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 23.1 | Previous period | Icon button | — | Disabled until the period loads | | |
| 23.2 | Period label | Display | — | — | | |
| 23.3 | Next period | Icon button | — | Disabled when the period ends today or later | | |
| 23.4 | "Paid {date}" / "Exported" chip | Display | pay_periods row | When exported | | |
| 23.5 | "Approve N without flags" | Button | Approves each submitted, unflagged timesheet one at a time | When any qualify | | |
| 23.6 | "Payroll" | Button link | → `/timesheets/payroll/:start`. Primary style once everything with hours is approved | — | | |
| 23.7 | Employee row: name, reg / OT hours, flag count chip (red if blocking), status chip | Link | → `/timesheets/:id` | Only linked when a sheet exists | | |
| 23.8 | Empty "No employees yet — …Settings › Employees" | Text + link | **Also shows while the data is still loading** (no loading state) | — | | |

### 24. `/timesheets/:id` — Timesheet detail (`TimesheetDetailView.tsx`, `TimeEntryDialog.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 24.1 | Back "Timesheets" | Link | — | — | | |
| 24.2 | Period + status chip + "Locked · approved by …" | Display | Locked = status approved only (an exported pay period is locked in the DB but not shown as locked here) | — | | |
| 24.3 | Tiles Regular / Overtime / Est. gross pay / Job cost (+burden %) | Display | "Rate missing" in red | — | | |
| 24.4 | "No pay rate on file…" + Settings › Employees link | Text + link | — | missingRate | | |
| 24.5 | Unlock | Button → dialog | Needs a reason | Locked | | |
| 24.6 | Reject | Button → dialog | Needs a comment | Not locked; disabled if already rejected | | |
| 24.7 | "Approve & lock" | Button | approve_timesheet | Disabled if there's a blocking flag, no entries, or pending | | |
| 24.8 | Reject / Unlock dialog: textarea + Reject / Unlock button | Dialog | Disabled until text is entered | — | | |
| 24.9 | Rejected comment / employee note | Display | — | — | | |
| 24.10 | Flag list (blocking red / warn amber, employee's note) | Display | — | — | | |
| 24.11 | Day card: hours, OT | Display | — | — | | |
| 24.12 | Entry row button (project, clock times, break, source, note, hours, reg + OT, rate, cost) | Button → TimeEntryDialog | A hours-only entry gets the toast "Edit it on the project's Labor page." | Disabled when locked | | |
| 24.13 | "+ Add time" per day | Link button | TimeEntryDialog pre-filled 07:00–15:30, 30 min break | Not locked, day ≤ today | | |
| 24.14 | TimeEntryDialog: Project select | Select | — | — | | |
| 24.15 | TimeEntryDialog: Start / End time | Time inputs | An end at or before the start rolls to the next day (overnight) | — | | |
| 24.16 | TimeEntryDialog: Unpaid break (minutes) | Numeric input | — | — | | |
| 24.17 | TimeEntryDialog: Note | Input | — | — | | |
| 24.18 | TimeEntryDialog: preview "X hours before any rounding" / "End time must be after the start." | Display | — | — | | |
| 24.19 | TimeEntryDialog: Delete | Button | Deletes **without confirmation** | Existing entry | | |
| 24.20 | TimeEntryDialog: Save | Button | ownerSaveTimeEntry | Disabled when invalid or saving | | |
| 24.21 | Activity log | List | — | — | | |
| 24.22 | Loading / not found | Text | — | — | | |

### 25. `/timesheets/payroll/:start` — Payroll (`PayrollView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 25.1 | Back "Timesheets" | Link | — | — | | |
| 25.2 | "Estimated gross pay only…" info | Display | Shows the OT multiplier | — | | |
| 25.3 | "N timesheets aren't approved yet (names). Review" | Warning + link | — | When any aren't approved | | |
| 25.4 | Employee row: reg, OT, rates "$a → $b/h", gross or "Rate missing" | Display | — | — | | |
| 25.5 | Total row | Display | — | — | | |
| 25.6 | Export "CSV" | Button | Downloads `payroll-generic-{start}-to-{end}.csv` | Disabled until every sheet with hours is approved and has a rate | | |
| 25.7 | Export "Gusto CSV" | Button | first_name, last_name, regular_hours, overtime_hours (the layout is a best guess, per the code comment) | Same gating as 25.6 | | |
| 25.8 | "Mark exported (locks the period)" | Button | mark_pay_period | Disabled unless ready | | |
| 25.9 | Paid-on date + "Mark paid" | Date input + button | — | Exported, not paid | | |
| 25.10 | "Unlock period" | Ghost button | Unlocks **immediately, with no confirmation or reason** (the timesheet unlock needs a reason) | Exported | | |
| 25.11 | Empty "No hours in this period." | Text | — | — | | |

### 26. `/settings/payroll` — Payroll & time (`SettingsPayrollView.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 26.1 | Pay period (Weekly / Every two weeks / Twice a month) | Select | — | Renders nothing until loaded | | |
| 26.2 | Week starts on (Sun–Sat) | Select | Also sets the overtime week | — | | |
| 26.3 | "A pay period started on" | Date input | Biweekly anchor | Biweekly only | | |
| 26.4 | Weekly overtime after (hrs) | Decimal input | > 0 | — | | |
| 26.5 | Daily overtime after (hrs, blank = Off) | Decimal input | — | — | | |
| 26.6 | Overtime pay (× rate) | Decimal input | ≥ 1 | — | | |
| 26.7 | Payroll burden (%) | Decimal input | 0–100 | — | | |
| 26.8 | Round clock times (none / 5 / 15 min) | Select | — | — | | |
| 26.9 | Auto-deduct unpaid lunch | Switch | — | — | | |
| 26.10 | Deduct (minutes) / On days longer than (hrs) | Inputs | — | Lunch on | | |
| 26.11 | Flag a long day over (hrs) | Input | — | — | | |
| 26.12 | Save | Button | Upsert; re-costs open timesheets. Disabled when invalid or unchanged | — | | |

### 27. Settings › Employees › Pay rate (`PayRatesEditor.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 27.1 | Current rate "$X/hr" / "No rate yet…" | Display | The first rate with effective_date ≤ today, **in list order** | Owner only | | |
| 27.2 | Rate input | Decimal | ≥ 0 | — | | |
| 27.3 | Effective from | Date | Defaults to today | — | | |
| 27.4 | Add | Button | addPayRate; re-costs | — | | |
| 27.5 | Delete rate (trash) | Icon button | No confirmation | — | | |

### 28. `/employee/time` — Crew time clock (`EmployeeTimeView.tsx`, `CrewHomeCards.tsx`)

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 28.1 | Clock in: project select + "Clock in" | Select + button | time_clock_in | Crew; no running timer | | |
| 28.2 | Running timer + break minutes + note + "Clock out" | Inputs + button | time_clock_out | Running | | |
| 28.3 | "Previous week not submitted" nudge | Button | Jumps to that period | — | | |
| 28.4 | Previous / next period | Icon buttons | Next is disabled on the current period | — | | |
| 28.5 | Entry rows → edit / "+ Add time" | Buttons | TimeEntryDialog | Editable periods; a running entry today is disabled | | |
| 28.6 | Flag note inputs | Inputs | Required to submit | — | | |
| 28.7 | Week note + "Submit week" | Textarea + button | time_submit_week | Disabled unless canSubmit and no running timer | | |
| 28.8 | Home CrewClockCard: Clock out / Clock in (quick job) / open time | Buttons | — | Crew home | | |

### 29. `/settings/invoicing` — Invoicing & payments (`SettingsInvoicingView.tsx`), placeholder

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 29.1 | Payment due (days), default 30 | Number input (uncontrolled) | Nothing reads it. New invoices get no due date; Business health uses its own 14-day setting | Placeholder | | |
| 29.2 | Late fee %/mo, default 1.5 | Number input | Not applied anywhere | Placeholder | | |
| 29.3 | Invoice number prefix "INV-" | Input | Not used; createInvoice hard-codes "INV-" | Placeholder | | |
| 29.4 | Accepted methods switches (Card / ACH / Check / Cash) | Switches | Not saved; the Record payment method list is fixed | Placeholder | | |
| 29.5 | Save changes | Button | **No onClick; does nothing** | Placeholder | | |

### 30. `/settings/billing` — Plan & billing (`SettingsBillingView.tsx`), placeholder

| # | Item | Type | What it should do | Role/State | Status | Note |
|---|---|---|---|---|---|---|
| 30.1 | Plan "Pro · $49/mo · Renews Oct 1, 2026" | Display | Hard-coded | Placeholder | | |
| 30.2 | Change plan | Button | No handler | Placeholder | | |
| 30.3 | "Visa ending in 4242" + Update | Display + button | Hard-coded; no handler. No Stripe | Placeholder | | |
| 30.4 | Billing email (default billing@rossihardscape.com) | Input | Not saved | Placeholder | | |

---

### Calculations

| # | Calculation | Formula (as coded) | File:line | Status | Note |
|---|---|---|---|---|---|
| C1 | Quote line total | `price × (quantity ?? 1)` | src/lib/api.ts:1165 | | |
| C2 | Quote total | Σ included items' line totals + Σ selection-group totals on included sections | src/lib/api.ts:1176 | | |
| C3 | Headline quote | Most recent approved original, else sent, else draft (add-ons never) | src/lib/api.ts (pickHeadlineQuote, ~1195) | | |
| C4 | Approved CO total | Σ `co.amount` where status = approved | src/lib/api.ts:1211 | | |
| C5 | Approved add-on total | Σ quoteTotal of kind=addon, status=approved | src/lib/api.ts:1234 | | |
| C6 | Contract value (client) | headline quoteTotal + C5 + C4 | src/lib/api.ts:1226 | | |
| C7 | Contract value (SQL, receipts / Hub) | quote_committed_total(headline original approved > sent > draft) + Σ approved add-ons + Σ approved `co.amount` | supabase/migrations/0111_project_payments.sql:266 | | |
| C8 | Deposit overdue | signed ≥ 3 days ago AND `paidTotal < contractTotal × deposit_percentage/100` | src/lib/api.ts:1252-1263 | | |
| C9 | Client lifetime revenue | Σ amount of non-void payments | src/lib/api.ts:1269 | | |
| C10 | Client outstanding | Σ over sent/overdue of `max(0, amount − (amount_paid ?? 0))` | src/lib/api.ts:1275 | | |
| C11 | New invoice number | `INV-` + pad3(count of invoices on the project, or standalone count, + 1) | src/lib/api.ts:3333 | | |
| C12 | Project invoice amount (deposit) | `headlineQuoteTotal × deposit% / 100`, rounded to cents | src/lib/api.ts:3385-3386 | | |
| C13 | Project invoice amount (balance) | `max(0, contract − Σ amount of ALL invoices incl. drafts)` | src/lib/api.ts:3383-3386 | | |
| C14 | Auto deposit vs balance | deposit if kind=deposit OR (auto AND no invoice with notes="Deposit" AND deposit% > 0 AND contract > 0) | src/lib/api.ts:3382 | | |
| C15 | Invoice items total | Σ `(qty‖0) × (unit_price‖0)` | src/lib/api.ts:501 | | |
| C16 | Invoice amount on save | lines ? round2(C15) : fallback single amount | src/lib/api.ts:497-498 | | |
| C17 | Workspace draft total | itemised ? Σ parseFloat(qty) × parseFloat(price) : parseFloat(amount) | src/components/views/InvoiceWorkspace.tsx:74,195 | | |
| C18 | Allocation cleanup | keep allocations > 0.004, round to cents | src/lib/api.ts:3520 | | |
| C19 | Apply project credit | Oldest active payment first: `free = amount − Σ allocations`; `take = min(free, left)`; tops up / adds the allocation | src/lib/api.ts:3627-3645 | | |
| C20 | Workspace credit to apply | `min(projectCredit, invoiceBalance)` | src/components/views/InvoiceWorkspace.tsx:270 | | |
| C21 | Active payment | `status !== "void"` | src/lib/projectMoney.ts:36 | | |
| C22 | Payment applied | round2(Σ allocations) | src/lib/projectMoney.ts:41 | | |
| C23 | Payment unallocated (credit) | `max(0, round2(amount − applied))` | src/lib/projectMoney.ts:44 | | |
| C24 | Applied by invoice | Σ active payments' allocations per invoice_id | src/lib/projectMoney.ts:47-54 | | |
| C25 | Invoice paid | `amount_paid ?? (status=paid ? amount : 0)` | src/lib/projectMoney.ts:58-59 | | |
| C26 | Invoice balance | `max(0, round2(amount − C25))` | src/lib/projectMoney.ts:61-62 | | |
| C27 | Invoice payment state | paid if status=paid; draft; partial if paid > 0.004; else unpaid | src/lib/projectMoney.ts:66-70 | | |
| C28 | Open invoices | status sent/overdue AND balance > 0.004 | src/lib/projectMoney.ts:73-74 | | |
| C29 | Project money summary | received = Σ active amount; applied = Σ C22; invoiced = Σ non-draft amount; unpaidInvoiceBalance = Σ non-draft `max(0, amount − C24)`; remaining = contract − received; unallocatedCredit = Σ C23; overpaid = max(0, −remaining) | src/lib/projectMoney.ts:89-112 | | |
| C30 | Suggest allocations | Open invoices oldest first; `take = min(left, balance)` | src/lib/projectMoney.ts:130-140 | | |
| C31 | Contract breakdown (Hub / summary PDF) | original headline total + Σ approved CO `(total ?? amount)` + Σ approved add-on totals | src/lib/projectMoney.ts:187-213 | | |
| C32 | Record-payment candidates | `available = balance + own existing allocation` | src/components/payments/RecordPaymentSheet.tsx:122 | | |
| C33 | Record-payment credit | `total − Σ allocations` (error if < −0.004; error if any allocation > available + 0.004) | RecordPaymentSheet.tsx:160-172 | | |
| C34 | DB: allocation within payment | deferred trigger: Σ allocations ≤ payment.amount + 0.005 (checked on allocation insert/update only) | 0111_project_payments.sql:127-145 | | |
| C35 | DB: invoice amount_paid / status / paid_at | amount_paid = Σ active allocations; status = paid if paid ≥ amount − 0.005 AND amount > 0; paid → sent if it drops below; paid_at = last paid_on + 12h UTC | 0111_project_payments.sql:151-174 | | |
| C36 | DB: receipt number | `R-` + pad4(max numeric part of the user's receipts + 1) under an advisory lock | 0111_project_payments.sql:107-118 | | |
| C37 | Receipt "Remaining project balance" | `project_contract_value(now) − Σ active payments with (paid_on, created_at) ≤ this one`; UI shows max(0, …) | 0113_document_versions_client_serializer.sql:601-617; SharedReceipt.tsx:93 | | |
| C38 | Public invoice balance | `max(0, amount − (amount_paid ?? 0))` | src/pages/SharedInvoice.tsx:63-65 | | |
| C39 | Date range resolve | local midnight start; end exclusive = tomorrow; last_3 = month −2 day 1; last_12 = month −11; custom = [start, end + 1 day) | src/lib/financials.ts:110-132 | | |
| C40 | Within range | `new Date(iso) >= start && < end` (a date-only ISO parses as UTC midnight) | src/lib/financials.ts:144-148 | | |
| C41 | Invoiced total | Σ amount of non-draft invoices with created_at in range | src/lib/financials.ts:164-170 | | |
| C42 | Collected total | Σ active payments with paid_on (local midnight) in range | src/lib/financials.ts:178-187 | | |
| C43 | Collection rate | `collected / invoiced × 100`, null if invoiced ≤ 0 | src/lib/financials.ts:191-195 | | |
| C44 | Days late | `floor((now − dueDate local midnight) / 86.4M)`; 0 if no due date / paid / draft | src/lib/financials.ts:208-211 | | |
| C45 | Aging buckets (4) | sent/overdue only; ≤0 Current, ≤30, ≤60, else 60+; amount = C26 (skip ≤ 0) | src/lib/financials.ts:221-238 | | |
| C46 | Outstanding total | Σ C45 amounts | src/lib/financials.ts:242-244 | | |
| C47 | Overdue count | sent/overdue with days late > 30 | src/lib/financials.ts:247-251 | | |
| C48 | Resolve cost | `actualExpenses ?? costPlanTotal ?? null` | src/lib/financials.ts:261-263 | | |
| C49 | Closed job | `contract > 0 && collected ≥ contract` | src/lib/financials.ts:268-270 | | |
| C50 | Billing badge | none if contract ≤ 0; paid; partially_paid if collected > 0; deposit_due if deposit > 0 and collected < deposit; invoiced; else null | src/lib/financials.ts:296-308 | | |
| C51 | Per-project profit / margin | profit = contract − cost; margin% = round((contract − cost)/contract × 100); excludes estimating / lost | src/lib/financials.ts:398-434 | | |
| C52 | Dominant category | Category with the largest Σ line total on the headline quote | src/lib/financials.ts:347-362 | | |
| C53 | Job date | actual_end_date ?? scheduled_end_date ?? created_at | src/lib/financials.ts:364-366 | | |
| C54 | Avg margin | `round(mean of per-job marginPct)`, unknown cost excluded (unweighted) | src/lib/financials.ts:455-462 | | |
| C55 | Job stats | avg = round(mean contract); median; max; min over closed jobs | src/lib/financials.ts:484-492 | | |
| C56 | Job size buckets | [0,5k) [5k,15k) [15k,30k) [30k,∞) by contract | src/lib/financials.ts:503-515 | | |
| C57 | Monthly breakdown | Bucket by `created_at.slice(0,7)` (UTC month): invoiced Σ amount, collected Σ C25, outstanding Σ C26 on sent/overdue | src/lib/financials.ts:536-560 | | |
| C58 | Has a year of history | now − earliest created_at ≥ 365 days | src/lib/financials.ts:565-569 | | |
| C59 | Monthly revenue / collected (dashboard) | Σ non-draft amount by created_at month / Σ active payments by paid_on month | src/lib/financials.ts:589-612 | | |
| C60 | MoM change | `(curr − prev)/prev × 100`, null if prev = 0 or < 2 points | src/lib/financials.ts:616-622 | | |
| C61 | Collected by category | Allocated part spread by the invoice quote's included-line category mix (else the project mix); unallocated part spread by the project mix (headline + approved add-ons); nothing categorised → Uncategorized | src/lib/financials.ts:654-713 | | |
| C62 | Category jobs / avg / margin | jobs in marginRowsInRange by dominant category; avg = round(Σ contract / count); margin = round(Σ profit / Σ contract × 100) | src/lib/financials.ts:715-747 | | |
| C63 | Collected by client | Σ payment amount by the project's client_id (payments with no project are skipped); pct = round(rev / (Σ ‖ 1) × 100); outstanding = Σ C26 of sent/overdue; job count = all projects | src/lib/financials.ts:769-817 | | |
| C64 | Revenue overview category pct | round(rev / (Σ rev of rows > 0 ‖ 1) × 100), top 6 | src/components/views/RevenueView.tsx:156-166 | | |
| C65 | Margin by category / month (margin page) | `round(Σ profit / Σ contract × 100)` (0 if revenue 0) | src/components/views/RevenueMarginView.tsx:121-153 | | |
| C66 | Project invoices: not invoiced | `max(0, round2(contract − invoiced))` | src/components/views/ProjectInvoicesView.tsx:69 | | |
| C67 | Project invoices: % of contract | `round(invoiced / contract × 100)`, `round(received / contract × 100)` | ProjectInvoicesView.tsx:166,170 | | |
| C68 | Invoice timing | draft "Not sent yet"; paid / balance ≤ 0.004 "Paid"; late > 0 "N days late"; 0 "Due today"; "Due in N days" (warn ≤ 3) | src/lib/projectBilling.ts:41-50 | | |
| C69 | Needs attention | open = non-draft, non-paid, balance > 0.004 → overdue (late > 0) / not opened / viewed-unpaid | src/lib/projectBilling.ts:68-77 | | |
| C70 | CO summary | approvedChanges = Σ approved amount; original = contract − approvedChanges; pending = sent COs (count, Σ amount); scheduleDays = Σ approved impact days | src/lib/projectBilling.ts:101-112 | | |
| C71 | Invoices last-30 received | Σ active payments paid_on in [today − 30, tomorrow) | src/components/views/InvoicesView.tsx:72-79 | | |
| C72 | Expenses last 30 days | Σ amount where `now − date(local) ≤ 30 days` (future dates included) | src/components/views/ExpensesView.tsx:71-73 | | |
| C73 | Expense category allocation | non-split: whole amount → its category; split: Σ per line category + remainder (total − Σ lines) → Uncategorized (can be negative) | src/lib/expenseSplit.ts:14-29 | | |
| C74 | Split allocation meter | allocated = round2(Σ lines); remainder = round2(total − allocated); balanced if remainder = 0 | src/lib/expenseSplit.ts:42-46 | | |
| C75 | BH: working days / add working days | Count of work_days minus holidays; step forward day by day | src/lib/businessHealth.ts:30-51 | | |
| C76 | BH: crew capacity | Booked day set from scheduled / in-progress jobs (from today); utilisation = booked / available over 4 / 8 / 12 weeks; open next 3 weeks = available − booked in [today, today + 20] | src/lib/businessHealth.ts:94-126 | | |
| C77 | BH: unscheduled backlog finish | Cursor per crew = bookedThrough (or yesterday); wouldFinish = addWorkingDays(cursor, crewDays); a job with no crew goes to the earliest-free crew | src/lib/businessHealth.ts:145-167 | | |
| C78 | BH: planned crew days | estimated_duration_days if > 0, else round1(planned man-hours / crew-day hours) | src/lib/businessHealth.ts:170-174 | | |
| C79 | BH: cash forecast lines | draft balance at today + dueDays; sent balance at due_date (or created + dueDays), overdue kept separate; projected deposit = `max(0, min(remaining, contract × dep%/100 − invoiced))` at start + dueDays; final = remaining − deposit at end + dueDays | src/lib/businessHealth.ts:236-259 | | |
| C80 | BH: cash periods | P1 = all lines ≤ today + 29; P2 = [today + 30, today + 59]; P3 = [today + 60, today + 89]; credits (P1 only) = min(credits, in); payroll = weekly × 30/7; overhead = monthly; net = in − payroll − overhead | src/lib/businessHealth.ts:261-273 | | |
| C81 | BH: weekly payroll | Σ labor cost (incl. burden) of the last 28 days' timesheet entries ÷ 4 | src/components/health/useBusinessHealth.ts:170-171 | | |
| C82 | BH: monthly overhead | annualOverhead / 12 | useBusinessHealth.ts:172 | | |
| C83 | BH: credits | Σ C23 over active payments (all projects) | useBusinessHealth.ts:173 | | |
| C84 | BH: aging detail (5 buckets) | sent/overdue, balance > 0; late = daysBetween(due, today) (0 if no due); Current ≤ 0, 1–30, 31–60, 61–90, 91+ | src/lib/businessHealth.ts:288-297 | | |
| C85 | BH: backlog $ / crew-weeks | Σ contract of scheduled + in_progress; crew-weeks = round1((future booked days + unscheduled crew days) / 5) | useBusinessHealth.ts:130-145,271 | | |
| C86 | BH: month compare | Sums by date string: this month ≤ today, last month, same month last year, YTD, YTD last year to the same day | src/lib/businessHealth.ts:312-326 | | |
| C87 | BH: booked items | approved quotes with a project (quoteTotal on the signed_at‖updated_at UTC day) + approved COs (amount on the approved_at UTC day) | useBusinessHealth.ts:201-207 | | |
| C88 | BH: pct change | `round((now − before)/before × 100)`, null if before ≤ 0 | src/lib/businessHealth.ts:328 | | |
| C89 | BH: win stats | winRate = won / decided; avgJob = round(Σ won contract / won) | src/lib/businessHealth.ts:331-340 | | |
| C90 | BH: weighted pipeline | Σ headline quote value × stage probability / 100 per stage | useBusinessHealth.ts:219-223 | | |
| C91 | BH: fully loaded profit | profit − planned man-hours × (project overhead_rate ?? burden/hr); loadedPct = round(loaded / contract × 100); avgLoadedPct = mean | useBusinessHealth.ts:236-241,288 | | |
| C92 | MROI: row metrics | winRate = won/(won + lost) × 100; CPL = spend / leads; CPW = spend / won; ROAS = wonRevenue / spend; profit/$ = grossProfit / spend (div → null if the divisor ≤ 0) | src/lib/marketingRoi.ts:129,204-215 | | |
| C93 | MROI: totals (blended) | Σ counts / revenue / profit over ALL sources (free included) ÷ Σ spend of paid sources only | src/lib/marketingRoi.ts:226-242 | | |
| C94 | MROI: CPL trend | per month per source: round(spend / leads) if both > 0 | src/lib/marketingRoi.ts:268-278 | | |
| C95 | MROI: overhead mismatch | |spend − overheadMarketing| ≥ 500 AND ≥ 25% of the max | src/lib/marketingRoi.ts:282-286 | | |
| C96 | MROI: lead month | `iso.length ≤ 10 ? slice(0,7) : local YYYY-MM` | src/lib/marketingRoi.ts:30 | | |
| C97 | MROI: won money | revenue = contract; gross = C51 profit; loaded = profit − planned man-hours × overhead rate | src/components/marketing/LeadSourceReport.tsx:109-126 | | |
| C98 | Spend amount parse | strip `$ , space`; ≥ 0 and finite → round2; else NaN; empty → null | src/components/marketing/SpendDialogs.tsx:12-17 | | |
| C99 | DB: net hours per entry | timed: mins = end − start; rounded to the nearest N min (if set); − break − auto lunch (longest entry of a no-break day over the threshold); `max(0, round2(mins/60))`; running = 0; hours-only = as typed (not rounded) | 0131_timesheets.sql:268-283 | | |
| C100 | DB: daily OT | `max(0, dayTotal − dailyLimit) − max(0, dayBefore − dailyLimit)` (0 if no daily limit) | 0131_timesheets.sql:285-289 | | |
| C101 | DB: weekly OT | `max(0, weekReg + regCand − weeklyLimit) − max(0, weekReg − weeklyLimit)`; reg = regCand − weeklyOT; ot = dailyOT + weeklyOT; in entry order (date, start nulls last, created) | 0131_timesheets.sql:290-294 | | |
| C102 | DB: labor cost | `round2((reg × rate + ot × rate × otMult) × (1 + burden%/100))`, 0 when there's no rate | 0131_timesheets.sql:298-305 | | |
| C103 | DB: rate on a date | Latest employee_pay_rates with effective_date ≤ date | 0131_timesheets.sql:202-206 | | |
| C104 | DB: workweek start / pay period | `date − ((dow − week_start + 7) % 7)`; weekly = 7 days; biweekly = anchor + floor((d − anchor)/14) × 14; semimonthly = 1–15 / 16–EOM | 0131_timesheets.sql:175-199 | | |
| C105 | Entry preview hours | `(end − start)/60000 − break` → round2(/60), null if ≤ 0; end ≤ start → +1 day | src/lib/timesheets.ts:93-111 | | |
| C106 | Day / period totals | Σ hours, Σ ot (reg falls back to hours when reg_hours is null) | src/lib/timesheets.ts:113-134 | | |
| C107 | Timesheet flags | running / missing clock-out (blocking); overlap (sorted by start); long day (> long_day_hours); rain-day entry | src/lib/timesheets.ts:141-187 | | |
| C108 | Payroll row gross | Σ `reg × rate + ot × rate × otMultiplier(current setting)`; entries with no rate are skipped and set missingRate | src/lib/timesheets.ts:220-239 | | |
| C109 | Payroll totals | Σ reg, Σ ot, Σ gross (round2) | src/components/timesheets/PayrollView.tsx:55 | | |
| C110 | Timesheet job cost tile | Σ stored `cost` of entries | src/components/timesheets/TimesheetDetailView.tsx:105 | | |
| C111 | CSV cell escaping | Quote when the value contains `"`, `,` or `\n`; `"` → `""` | src/lib/timesheets.ts:241-245 | | |
| C112 | Gusto name split | Last whitespace token = last name; the rest = first name | src/lib/timesheets.ts:261-270 | | |

---

### Code observations (unverified)

All of these come from reading the code. None was reproduced in a running app. Money issues are listed first.

#### Money

1. **Restoring a voided payment can over-apply an invoice. Nothing blocks it.** `restorePayment` (src/lib/api.ts:3611) sets status back to active and the old allocations count again. The DB only checks Σ allocations ≤ **payment** amount (0111:127-145), never ≤ **invoice** balance. The UI's per-invoice check lives only in RecordPaymentSheet.tsx:162.
   - Example: INV-001 is $1,000. Payment A ($1,000) is applied, then voided. Payment B ($1,000) is applied. Restoring A (5.9, no confirmation) gives amount_paid $2,000 on a $1,000 invoice.
   - The balance clamps to $0, but Revenue › monthly "Collected" (C57) shows $2,000 for that invoice, and the project's Collected shows $2,000.
2. **Lowering a payment's amount below what it has applied isn't blocked in the DB.** The within-amount constraint trigger fires only on `payment_allocations` insert/update (0111:142-145), not on `payments.amount` updates. `updatePayment` (api.ts:3561) can shrink the amount directly. RecordPaymentSheet sends the allocations first, but any other caller, or a failed second step, can leave allocations > amount.
   - Example: a $500 payment applied $500 to INV-002 is edited to $300. If `setPaymentAllocations` succeeds and `updatePayment` fails, the edit is half-applied. The reverse order can leave $500 applied against a $300 payment: invoice paid $500, received $300, credit shows $0 because it's clamped.
3. **Payment edits and credit application aren't atomic.** `setPaymentAllocations` (api.ts:3572-3600) runs one sequential request per delete/update/insert. `createPayment` (api.ts:3525-3551) inserts the payment and then the allocations, and on failure voids the payment, which burns a receipt number (R-000n stays as a VOID receipt). `applyProjectCredit` (api.ts:3627) loops over payments with no transaction. The "decrease first" comment is also inaccurate: increases and decreases share one loop (3588-3593), so swapping amounts between two invoices can trip the deferred check mid-way. The check is deferred to commit, but each PostgREST call is its own transaction.
   - Example: a $1,000 payment has A = 600 and B = 400; it's changed to A = 400, B = 600. If the loop hits B first, B's update commits alone at 600 + 600 = 1,200 > 1,000 and is rejected.
4. **"Remaining balance" in the New invoice menu doesn't match the invoice it creates.** The label uses contract − non-draft invoiced (ProjectInvoicesView.tsx:69,115). `createProjectInvoice` subtracts **all** invoices, drafts included (api.ts:3383).
   - Example: contract $10,000 with a $3,000 draft deposit. The menu says "Remaining balance · $10,000" but creates a $7,000 draft.
   - The deposit basis differs too: `createProjectInvoice` uses headline-quote% only (api.ts:3385). Business-health projections use contract (incl. COs) × % (businessHealth.ts:253). `isDepositOverdue` uses contractTotal × % (api.ts:1261).
5. **Deleting an invoice from /invoices has no confirmation, is allowed on paid invoices, and silently turns applied payments into credit.** See InvoicesView.tsx:221: allocations cascade on delete (0111:50), and only `["invoices"]` is invalidated (InvoicesView.tsx:55), so the payments and credit views stay stale.
   - It also breaks numbering. `createInvoice` numbers by count (api.ts:3326-3333): with INV-001..003, deleting INV-002 makes the next invoice **INV-003 again** (a duplicate).
6. **Status "overdue" is never written by any app code or trigger.** No `status: "overdue"` exists in src/ or supabase/. So the Overdue filter/count on /invoices (1.7) and "Overdue" in Revenue › Invoiced (13.3) are always 0, while "N days late" badges show everywhere.
   - The sync trigger also resets a formerly-paid invoice to `'sent'` (0111:166), never to overdue.
7. **Revenue › "Invoiced by month" and the Revenue overview chart show "Paid/Collected" on a different basis from the Collected card.** `monthlyBreakdown` uses `invoicePaid` of invoices **created** that month (financials.ts:556), not payments dated in it.
   - Example: a $5,000 invoice created in August is paid in September. The chart shows Aug Paid $5,000 and Sep $0. The Collected card and `/revenue/collected` show Sep $5,000.
   - The monthly page's "Collected" KPI (17.2) and its table column therefore disagree on the same page. The same restore-overpay case (#1) inflates the chart.
8. **UTC month / day bucketing of timestamps.**
   - `monthlyBreakdown`, `monthlyRevenue` and `monthlyCollected` bucket by `created_at.slice(0,7)` (UTC) (financials.ts:534,540,581,593), while `withinRange` compares in local time. An invoice created at 8:30 pm PDT on Sep 30 (03:30Z Oct 1) counts in the "September" range total but lands in the **October** bar. RevenueInvoicedView shows its "Date issued" as Oct 1 (RevenueInvoicedView.tsx:150).
   - Business-health booked items use `signed_at.slice(0,10)` and `approved_at.slice(0,10)` (useBusinessHealth.ts:204-205), with the same UTC-day skew.
9. **Date-only columns parsed as UTC midnight in range filters.** `withinRange(iso)` does `new Date(iso)` (financials.ts:146). For date columns like `actual_end_date` / `scheduled_end_date` (0061:16) and closeouts' `completed_on`, "2026-09-01" becomes Aug 31 8 pm EDT.
   - Example: a job completed Sep 1 is excluded from "This month" margin/avg-job and counted in August (RevenueMarginView, RevenueJobsView, Business health profitability, useBusinessHealth.ts:236,245).
   - Month drill-down end date: `new Date(y, m, 0).toISOString().slice(0,10)` (RevenueInvoicedView.tsx:31) gives the **29th/30th** in UTC+ timezones, which drops the last day of the month.
10. **Avg. margin is unweighted, but the "Margin by category/month" beside it is revenue-weighted** (financials.ts:460 vs RevenueMarginView.tsx:134,152).
    - Example: a $1,000 job at 50% plus a $100,000 job at 10% gives an Avg margin of 30%, while the category row shows ≈ 10.4%.
    - Cost also prefers **any** logged expense over the cost plan (financials.ts:262, 411): a $20,000 job with one $50 receipt logged reads 100% margin (rounded), ignoring a $12,000 plan. The column is labeled "Est. cost" (RevenueMarginView.tsx:189).
11. **Blended marketing ROAS divides all-source revenue (free referrals included) by paid spend only** (marketingRoi.ts:234,240-241).
    - Example: Google $1,000 spend → $5,000 won; Referrals (free) → $50,000 won. "All sources" ROAS = 55×, when paid ROAS is 5×.
    - The spend-grid save upserts with `note: null` (api.ts:8090 via SpendDialogs.tsx:122-128), wiping notes entered in the single-month form.
12. **Standalone invoices' payments vanish from per-client revenue.** A payment recorded on a standalone invoice has `project_id = null` (InvoiceWorkspace.tsx:719 → createPayment), and `collectedByClient` skips it (financials.ts:781-782). Linking the invoice to a project later (2.7) doesn't move the payment's project_id.
    - Result: Revenue › by client's rows don't add up to its own Collected KPI (19.1), and client lifetime value is understated.
13. **Collection rate can exceed 100%.** It's collected-in-range (any invoice, plus unallocated credit) ÷ invoiced-in-range (financials.ts:191-195).
    - Example: $10,000 is invoiced in August and all of it is collected in September. If September's only new invoice is $1,000, September's collection rate reads 10,000 ÷ 1,000 = 1,000%. If nothing was invoiced in September, it reads "—".
14. **The receipt's "Remaining project balance" is not historical.** It uses the **current** contract value (0113:601-617). An old receipt's balance changes whenever a later CO/add-on is approved or a payment before it is voided. Receipts are supposed to be fixed documents.
15. **CO amount basis is inconsistent.** Contract value, CO summary, SQL `project_contract_value` and billable extras all use `co.amount` (api.ts:1214; projectBilling.ts:103; 0111:276; InvoiceWorkspace.tsx:311). `contractBreakdown` uses `co.total ?? co.amount` (projectMoney.ts:199). If the itemised CO's `total` ≠ `amount`, the Client Hub math block and every other screen disagree.
16. **"Add lines from quote" drops Client Selections.** `fillFromQuote` copies included items only (InvoiceWorkspace.tsx:286-299) and ignores `quote_selection_groups`, which `quoteTotal` includes (api.ts:1184-1186).
    - Example: a $20,000 quote with a $2,500 selection group yields $17,500 of lines. Saving rewrites invoices.amount to $17,500.
17. **Projected cash uses the full contract with no check for payments already made against drafts.** Draft invoices appear both as "draft" lines and inside `invoiced` (useBusinessHealth.ts:157, businessHealth.ts:197,251). That's consistent, but payments recorded as unallocated credit before any invoice reduce only period 1 (businessHealth.ts:267).
    - Example: a $3,000 deposit paid as credit on a $30,000 job with no invoice yet still projects $30,000 in, less $3,000 only if it lands in the first 30 days.

#### Timesheets / payroll

18. **Decimal inputs on Settings › Payroll can't hold a trailing dot.** The field is controlled as `String(Number(v))` (SettingsPayrollView.tsx:38-45).
    - Typing "1.5" into Overtime pay goes "1" → "1." → Number = 1 → shows "1" → next keystroke "5" → **15**. The value is valid (≥ 1), so Save stores a 15× OT multiplier; burden % and daily OT hours are affected the same way.
    - Clearing a required field shows "NaN".
19. **Payroll gross uses the *current* OT multiplier, while stored labor cost used the multiplier at recompute time** (PayrollView.tsx:51; timesheets.ts:236 vs 0131:304). Changing the multiplier after a period is locked makes "Est. gross" and job cost disagree. Missing-rate hours are left out of gross entirely (timesheets.ts:231-233); they're only flagged.
20. **TimeEntryDialog rolls end ≤ start to the next day** (timesheets.ts:93-96).
    - Example: start 07:00, end 07:00 saves a 24-hour entry. A typo of end "3:30" (AM) instead of 15:30 saves 20.5 h with no warning beyond the preview; the long-day flag only applies at submit.
    - Delete time entry (24.19) and "Unlock period" (25.10) have no confirmation.
21. **CSV export escaping doesn't handle formula injection or `\r`** (timesheets.ts:241-245). An employee named `=HYPERLINK(...)` or `+1…` becomes a live formula in Excel/Sheets. The Gusto name split mis-handles suffixes: "Jose Garcia Jr" gives last name "Jr".
22. **Biweekly anchor isn't snapped to the workweek start** (0131:193-195). An anchor on a Wednesday with week_start Monday makes pay periods straddle OT weeks, so weekly OT is split across two pay periods and two timesheets.

#### Other / UI states

23. **Missing loading or error states.**
    - TimesheetsView shows "No employees yet…" while data loads (TimesheetsView.tsx:92).
    - RevenueView, the detail pages and BusinessHealthView gate "Loading…" on one query only and have no error branch, so a failed payments query renders $0 figures silently (RevenueView.tsx:189; useBusinessHealth.ts:70,138).
    - ProjectInvoicesView and ProjectInvoiceDetailView show "Failed to load…" while the **project** query is still pending (ProjectInvoicesView.tsx:101; ProjectInvoiceDetailView.tsx:18).
    - SettingsBusinessHealth and SettingsPayroll render blank until loaded.
24. **Expenses "Last 30 days" includes future-dated expenses** (ExpensesView.tsx:72: `now − future` is negative, which is ≤ 30 days). The inline date inputs save on every change event (ExpensesView.tsx:163; ProjectExpensesView.tsx:339), and a partially typed year can fire writes.
    - Global Expenses delete has no confirmation (8.12).
    - ProjectExpensesView invalidates only `["expenses",{project}]` (line 95), so the global `/expenses` list and Revenue margin (`["expenses"]`) stay stale until they refetch.
25. **Split expenses can be saved unbalanced ("Save anyway").** An over-allocated split gives Uncategorized a negative amount (expenseSplit.ts:26-27). The Uncategorized filter then lists the expense with a negative share.
26. **Placeholders look functional.** `/settings/invoicing` "Save changes" has no handler; payment terms, late fee and prefix are never used (SettingsInvoicingView.tsx:49-84). `/settings/billing` shows a hard-coded "Pro $49/mo, Visa 4242, billing@rossihardscape.com" (SettingsBillingView.tsx:31-60). The public invoice brands itself "ContractorPro" rather than the contractor's company name (SharedInvoice.tsx:79).
27. **Mobile layout risks.**
    - The LeadSourceReport table is `min-w-[1100px]`. It's desktop-only, but the md breakpoint (768px) can still scroll wide on tablets.
    - The Revenue detail tables have no mobile card fallback. They rely on `overflow-x-auto`, and the header's range select plus two 150px date inputs wrap.
    - The Business health headline row uses a `-mx-4` swipe strip.
    - InvoiceWorkspace's timeline is a 4-column grid with `timeAgo` labels.
    - The RecordPaymentSheet method pills wrap. These are fine in code but unverified at 390px.
28. **Settings › Business health.** Toggling every crew day off silently falls back to Mon–Fri capacity (businessHealth.ts:96). The "upcoming holidays" filter uses a UTC date (`toISOString().slice(0,10)`, SettingsBusinessHealthView.tsx:59), so today's holiday disappears after about 5–8 pm in US timezones.
29. **PayRatesEditor "current rate" assumes the rates list is sorted newest-first** (PayRatesEditor.tsx:22 `find(effective_date ≤ today)`). If the API returns them ascending, it shows the oldest rate. Not checked against `listPayRates` ordering.

---

## Area 07 — Settings, Employee role, Client Hub

Checklist of every user-facing interactive item in Settings (the hub plus the settings pages this file owns), the Employee (crew) shell, and the Client Hub (`/portal`, the review redirect `/r/:token`, and the magic-link sign-in).
This list comes from reading the code only. The **Status** and **Note** columns are left blank and get filled in during click-through testing.

**Not in this file** (other agents cover them): Settings › smart-sections, quick-quote-rates, pricebook, material-categories, suppliers, overhead, payroll, invoicing, billing, business-health. Their rows in the Settings hub list below are links only.

Roles:
- **Owner**: a normal signed-in account, meaning any auth user without an `employees` row (`src/lib/auth.tsx:104`).
- **Employee**: an account that has an `employees` row. It gets the restricted `EmployeeLayout` shell (`src/components/layout/AppLayout.tsx:93-98`). *Lead* and *Can log usage* are per-employee flags (0125).
- **Client**: a Client Hub session on the separate `portalSupabase` client (storage key `chq-portal-auth`). Identity is the JWT email matched against `clients.email`.
- **Anyone**: signed out.

---

### `/settings`: Settings hub (`src/components/views/SettingsView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Page subtitle | Display | Shows "Rossi Hardscape · N crews · pricebook updated Aug 30" (desktop) or "Rossi Hardscape · N crews" (mobile). **Hardcoded demo text: N is `DEMO_CREWS.length`** | Owner | | |
| 2 | Business profile | List link | Goes to `/settings/business-profile` | Owner | | |
| 3 | Overhead | List link | Goes to `/settings/overhead` (another agent) | Owner | | |
| 4 | Estimating insights | List link | Goes to `/settings/estimating-insights` | Owner | | |
| 5 | Quote defaults | List link | Goes to `/settings/quote-defaults` | Owner | | |
| 6 | Selection templates | List link | Goes to `/settings/selection-templates` | Owner | | |
| 7 | Categories | List link | Goes to `/settings/categories` | Owner | | |
| 8 | Lead sources | List link | Goes to `/settings/lead-sources` | Owner | | |
| 9 | Expense categories | List link | Goes to `/settings/expense-categories` | Owner | | |
| 10 | Material categories | List link | Goes to `/settings/material-categories` (another agent) | Owner | | |
| 11 | Suppliers | List link | Goes to `/settings/suppliers` (another agent) | Owner | | |
| 12 | Invoicing & payments | List link | Goes to `/settings/invoicing` (another agent) | Owner | | |
| 13 | Price Book | List link | Goes to `/settings/pricebook` (another agent) | Owner | | |
| 14 | Manage Smart Section Templates | List link | Goes to `/settings/smart-sections` (another agent) | Owner | | |
| 15 | Quick Quote Rates | List link | Goes to `/settings/quick-quote-rates` (another agent) | Owner | | |
| 16 | Team & crews | List link | Goes to `/settings/team` | Owner | | |
| 17 | Manage employees | List link | Goes to `/settings/employees` | Owner | | |
| 18 | Schedule & weather | List link | Goes to `/settings/weather` | Owner | | |
| 19 | Pre-construction checklist | List link | Goes to `/settings/precon` | Owner | | |
| 20 | Maintenance reminders | List link | Goes to `/settings/maintenance` | Owner | | |
| 21 | Payroll & time | List link | Goes to `/settings/payroll` (another agent) | Owner | | |
| 22 | Business health | List link | Goes to `/settings/business-health` (another agent) | Owner | | |
| 23 | Progress updates | List link | Goes to `/settings/progress` | Owner | | |
| 24 | Portfolio | List link | Goes to `/portfolio` (not under /settings) | Owner | | |
| 25 | Messages | List link | Goes to `/settings/messages` | Owner | | |
| 26 | Reviews | List link | Goes to `/settings/reviews` | Owner | | |
| 27 | Notifications | List link | Goes to `/settings/notifications` | Owner | | |
| 28 | Plan & billing | List link | Goes to `/settings/billing` (another agent) | Owner | | |
| 29 | Employee types `/settings` | Route guard | AppLayout redirects to `/employee` | Employee | | |

Every settings sub-page below shares two items: a **back link** (`MobilePageHeader` back to "Settings" on mobile, `BackLink` "Settings" on desktop), and the AppLayout guard that sends an employee to `/employee`. These are listed once here, not per page.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 30 | Back to Settings (mobile header) | Link | Goes to `/settings` | Owner | | |
| 31 | Back to Settings (desktop BackLink) | Link | Goes to `/settings` (or history back via useGoBack) | Owner | | |

### `/settings/business-profile` (`src/components/views/SettingsBusinessProfileView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Logo tile | Button → hidden file input (image/*) | Opens the file picker. **Uploads and saves right away, not on Save.** Shows a spinner while uploading, then the logo preview (signed URL). Errors show a toast | Owner | | |
| 2 | Company name | Text input | Edits the draft. Shown in the Client Hub and PDFs | Owner | | |
| 3 | Phone | Text input | Edits the draft. No format validation | Owner | | |
| 4 | Business email | Text input | Edits the draft. No email validation | Owner | | |
| 5 | License # | Text input | Edits the draft | Owner | | |
| 6 | Address | Text input | Edits the draft. Geocoded for the Dashboard weather strip | Owner | | |
| 7 | Crew start time | Time input | Defaults to 07:00 when cleared. Scopes the rain % | Owner | | |
| 8 | Crew end time | Time input | Defaults to 17:00 when cleared. No check that end is after start | Owner | | |
| 9 | Account email | Read-only input | Shows the signed-in email; disabled | Owner | | |
| 10 | Over-order margin % | Number input | Used for the material-alert chips (ProjectDetailView, OngoingJobsCard). Negative values allowed | Owner | | |
| 11 | Not-ordered warning (days) | Number input | Same as #10 | Owner | | |
| 12 | Default hourly rate | Number input (step 0.5) | Prefills labor blocks, labor log entries and the change-order labor rate | Owner | | |
| 13 | Save changes | Button | Saves the whole draft and toasts "Business profile saved". Disabled while loading or saving | Owner | | |
| 14 | Leave with unsaved edits | Unsaved-changes guard | Prompts Save / Discard / Stay | Owner | | |
| 15 | Load failure | State | No error state: the draft falls back to `BUSINESS_PROFILE_FALLBACK` and Save stays enabled | Owner | | |

### `/settings/estimating-insights` (`src/components/views/SettingsEstimatingInsightsView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | "Based on" count | Display | Shows the usable closeouts, how many are excluded, and the MIN_JOBS / TRIGGER rule | Owner | | |
| 2 | Completed job without closeout | Chip link (up to 12) | Goes to `/projects/:id` | Owner | | |
| 3 | Suggestion card: See / Hide the N jobs | Toggle button | Expands the evidence list | Owner | | |
| 4 | Evidence row: project name | Link | Goes to `/projects/:id` | Owner | | |
| 5 | Apply | Button | Applies the suggestion as the default (tunable or labor default), with an undo toast. Disabled while busy | Owner | | |
| 6 | Apply to {condition} only | Button (only when there is a condition) | Creates a ×median adjustment used only on matching jobs | Owner | | |
| 7 | Remind me later | Button | Snoozes the suggestion for 30 days and toasts | Owner | | |
| 8 | Dismiss | Button | Dismisses the suggestion permanently and toasts | Owner | | |
| 9 | Adjustments in effect: Turn off / Turn on | Button per row | Toggles the adjustment's `active` flag; shows strikethrough when off | Owner | | |
| 10 | Applied changes: Undo | Button per row | Restores the previous value; the row shows "undone {date}" | Owner | | |
| 11 | Variance colors: Green up to % | Decimal input | Validated as ≥0 | Owner | | |
| 12 | Variance colors: Red above % | Decimal input | Must be greater than green; shows an inline error | Owner | | |
| 13 | Variance colors: Save | Button | Enabled only when the values are dirty and valid; toasts | Owner | | |
| 14 | Empty states | State | "No suggestions right now", "None.", "Nothing applied yet." No loading state: these messages flash while the data loads | Owner | | |

### `/settings/quote-defaults` (`src/components/views/SettingsQuoteDefaultsView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Deposit required % | Number input | Prefills deposit % on new quotes (`createQuote`). No upper bound (it accepts 150) | Owner | | |
| 2 | Quote validity (days) | Number input | Note says "Auto-expires after". It only drives the "Valid until" row in the quote builder; nothing expires | Owner | | |
| 3 | Sales tax % (note "MA — materials only") | Number input (step 0.01) | **Not used on quotes.** Only the Change Order builder reads it (`ChangeOrderWorkspace.tsx:325`) | Owner | | |
| 4 | Terms shown on every quote | Textarea | Prefills terms on new quotes | Owner | | |
| 5 | Revert | Button | Resets the draft to the saved values | Owner | | |
| 6 | Save defaults | Button | Saves and toasts "Quote defaults saved" | Owner | | |
| 7 | Leave with unsaved edits | Behaviour | **No unsaved-changes guard on this page** (Business profile has one) | Owner | | |

### `/settings/selection-templates` (`src/components/views/SettingsSelectionTemplatesView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | New template | Button | Opens the template dialog, empty | Owner | | |
| 2 | Template row: summary | Display | Shows the name, Required/Optional, "multiple", and each option with its price label | Owner | | |
| 3 | Edit (pencil) | Icon button | Opens the dialog pre-filled | Owner | | |
| 4 | Delete (trash) | Icon button | **Deletes immediately, with no confirmation**, then toasts | Owner | | |
| 5 | Dialog: Group name | Input | Required | Owner | | |
| 6 | Dialog: Help text | Input | Optional | Owner | | |
| 7 | Dialog: Required | Checkbox | Defaults on | Owner | | |
| 8 | Dialog: Multiple choice | Checkbox | Allows more than one pick | Owner | | |
| 9 | Dialog: option Name | Input per option | Required for every option | Owner | | |
| 10 | Dialog: option Price ± | Decimal input | Positive adds, negative is a discount, 0 means included. Non-numeric text silently becomes 0 | Owner | | |
| 11 | Dialog: option Cost ± ("Internal only") | Decimal input | Internal cost delta. Must never reach the client | Owner | | |
| 12 | Dialog: option Default | Checkbox | With single-choice, checking one clears the others | Owner | | |
| 13 | Dialog: remove option | Icon button | Removes the option row | Owner | | |
| 14 | Dialog: Add option | Button | Appends an option. The first option added is the default | Owner | | |
| 15 | Dialog: Cancel | Button | Closes without saving | Owner | | |
| 16 | Dialog: Save template | Button | Disabled until there is a name, at least 2 options and every option is named. Toasts and closes | Owner | | |
| 17 | Empty / loading | State | "No templates yet…" (also shows while loading, since there is no loading state) | Owner | | |

### `/settings/categories` (`src/components/views/SettingsCategoriesView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Move up / Move down | Icon buttons | Swaps `sort_order` with the neighbour. Disabled on the first and last rows | Owner | | |
| 2 | Category name | Inline input (saves on blur) | Renames on blur when the value changed and isn't empty; otherwise reverts | Owner | | |
| 3 | Delete (trash) | Icon → AlertDialog | Confirm dialog: "line items become uncategorized". Delete / Cancel | Owner | | |
| 4 | New category name | Input (Enter submits) | Adds the category; the field clears immediately | Owner | | |
| 5 | Add | Button | Same as #4. Disabled when the field is empty or pending | Owner | | |
| 6 | Loading / empty | State | "Loading…" / "No categories yet" | Owner | | |

### `/settings/lead-sources` (`src/components/views/SettingsLeadSourcesView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Move up / Move down | Icon buttons | Reorders | Owner | | |
| 2 | Lead source name | Inline input (saves on blur) | Renames; spend follows the rename (0128 trigger) | Owner | | |
| 3 | Monthly spend | Text button (Paid sources only) | Opens `SpendFormDialog`, fixed to this source | Owner | | |
| 4 | Paid | Switch | Toggles `paid`. When off, spend shows "—" and the Monthly spend link is hidden | Owner | | |
| 5 | Delete | Icon → AlertDialog | Confirm; existing leads keep their value | Owner | | |
| 6 | New lead source + Add | Input + button | Adds the source | Owner | | |
| 7 | Spend dialog (SpendFormDialog) | Dialog | Enters monthly spend for the source (owned by the marketing component) | Owner | | |
| 8 | ROI colours: ROAS strong at / weak at | Decimal inputs | Strong must be greater than weak | Owner | | |
| 9 | ROI colours: Profit per $1 strong at / weak at | Decimal inputs | Same rule | Owner | | |
| 10 | ROI colours: Save | Button | Enabled only when dirty and valid. Toasts "Saved" | Owner | | |
| 11 | ROI card load | State | The card is hidden until its settings load. If loading fails it stays hidden, silently | Owner | | |

### `/settings/expense-categories` (`src/components/views/SettingsExpenseCategoriesView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Move up / Move down | Icon buttons | Reorders | Owner | | |
| 2 | Category name | Inline input (saves on blur) | Renames | Owner | | |
| 3 | Cost type | Select (material / labor / subs / equipment / other) | Sets `cost_type`, which decides the Profit Summary bucket. Defaults to material | Owner | | |
| 4 | Delete | Icon → AlertDialog | Confirm; the records become uncategorized | Owner | | |
| 5 | New category + Add | Input + button | Adds the category | Owner | | |
| 6 | Loading / empty | State | "Loading…" / "No categories yet" | Owner | | |

### `/settings/team`: Team & crews (`src/components/views/SettingsTeamView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Crew count | Display | Real count (`listCrews`) | Owner | | |
| 2 | Crew row | Display | Shows the name, "Led by X", and how many scheduled or in-progress jobs it has | Owner | | |
| 3 | Edit (pencil) | Icon button | Turns the row into the inline form | Owner | | |
| 4 | Delete (trash) | Icon button | **Deletes with no confirmation**. The crew's jobs are left with no crew | Owner | | |
| 5 | Form: Crew name | Input (autofocus) | Required | Owner | | |
| 6 | Form: Lead (optional) | Input | Free text (not linked to an employee) | Owner | | |
| 7 | Form: Cancel | Button | Closes the form | Owner | | |
| 8 | Form: Save | Button | Creates or updates the crew. Disabled when the name is empty | Owner | | |
| 9 | Add crew | Button (hidden while editing) | Opens the "new" form | Owner | | |
| 10 | Employees & crew logins | Card link | Goes to `/settings/employees`. Shows the active-employee count | Owner | | |
| 11 | Loading / empty | State | "Loading…" / "No crews yet…" | Owner | | |

### `/settings/employees`: Manage employees (`src/components/views/SettingsEmployeesView.tsx`, `src/components/timesheets/PayRatesEditor.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | + Add (mobile header) / + Add employee (desktop) | Button | Opens the Add employee dialog | Owner | | |
| 2 | Add dialog: Name | Input | Required | Owner | | |
| 3 | Add dialog: Email | Input (type=email) | Required. No format check (no form submit, so browser validation never runs) | Owner | | |
| 4 | Add dialog: Password | Input (password, min 6) | Required, 6+ characters. The owner shares it with the employee | Owner | | |
| 5 | Add dialog: Create employee | Button | Calls the `create-employee` Edge Function, which creates a *confirmed* auth user plus the `employees` row. Toasts "Employee created" or the function's error (e.g. email already in use) | Owner | | |
| 6 | Add dialog: close | Dialog X / overlay | Closes and resets the fields | Owner | | |
| 7 | Employee row header | Toggle button | Expands or collapses the row. Shows the name, email and an Active / Deactivated pill | Owner | | |
| 8 | Pay rate: current | Display | "$X/hr", or in red "No rate yet — hours can't be costed or paid" | Owner | | |
| 9 | Pay rate: New rate ($/hr) | Decimal input | Must be ≥0 and not empty | Owner | | |
| 10 | Pay rate: Effective | Date input | Defaults to today | Owner | | |
| 11 | Pay rate: Save rate | Button | Adds a rate row, toasts, and refreshes timesheets and labor entries | Owner | | |
| 12 | Pay rate history row: delete | Icon button | **Deletes the rate with no confirmation**. Future-dated rows are marked "upcoming" | Owner | | |
| 13 | Crew lead | Switch | Sets `is_lead`, which allows marking a work order Reviewed and downloading its PDF | Owner | | |
| 14 | Can log material usage | Switch | Sets `can_log_usage`, which shows Log usage on the work order Materials list | Owner | | |
| 15 | Assigned projects | Checkbox per project | Assigns or unassigns the employee (the list is `listProjects`, so pre-sale projects are hidden). No search or filter. Scroll box max-h-64 | Owner | | |
| 16 | Deactivate / Reactivate employee | Text button | Flips `status` immediately, **with no confirmation**. Deactivated employees lose project, photo, note and timesheet access through RLS. Their auth login still works | Owner | | |
| 17 | Loading / empty | State | "Loading…" / "No employees yet…" | Owner | | |

### `/settings/notifications` (`src/components/views/SettingsNotificationsView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Quote activity: A client opens a quote for the first time | Switch (optimistic) | Saves `quote_first_open` | Owner | | |
| 2 | Quote activity: A client changes selections or optional items | Switch | Saves `quote_selections` | Owner | | |
| 3 | Quote activity: A quote is signed or declined | Switch | Saves `quote_decided` | Owner | | |
| 4 | Quote activity: A client views a quote again | Switch | Saves `quote_viewed_again` | Owner | | |
| 5 | Weather risk on upcoming work days | Switch | Saves `weather_risk` | Owner | | |
| 6 | Pre-construction | Switch | Saves `precon` | Owner | | |
| 7 | Review requests | Switch | Saves `review_activity` | Owner | | |
| 8 | Maintenance reminders | Switch | Saves `maintenance` | Owner | | |
| 9 | Timesheets | Switch | Saves `timesheets` | Owner | | |
| 10 | Going cold: Not opened after X days | Numeric input | Whole number ≥1 | Owner | | |
| 11 | Going cold: Viewed but not signed after Y days | Numeric input | Whole number ≥1 | Owner | | |
| 12 | Going cold: Save | Button | Enabled only when dirty and valid | Owner | | |
| 13 | Automations: Add | Button | Opens the inline add form | Owner | | |
| 14 | Automation row: Enabled | Switch | Toggles the rule | Owner | | |
| 15 | Automation row: Delete | Icon button | **Deletes with no confirmation** | Owner | | |
| 16 | Add form: When (trigger) | Select, 11 triggers | The X and Y labels reflect the current thresholds | Owner | | |
| 17 | Add form: Task | Input | Default "Follow up with {client} about their quote". {client} and {project} are filled in | Owner | | |
| 18 | Add form: Type | Select (Follow up / Call / Text / Email) | Task type | Owner | | |
| 19 | Add form: Due in (days) | Numeric input | ≥0, floored | Owner | | |
| 20 | Add form: Cancel / Save automation | Buttons | Save is disabled when the title is empty or the due value is invalid | Owner | | |
| 21 | Settings load failure | State | The switches stay disabled with no error message | Owner | | |

### `/settings/weather`: Schedule & weather (`src/components/views/SettingsWeatherView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Business profile | Inline link | Goes to `/settings/business-profile` (crew hours) | Owner | | |
| 2 | Rain chance at or above (%) | Numeric input | Whole number 1–100 | Owner | | |
| 3 | Expected rain at or above (inches) | Decimal input | Greater than 0 and ≤10 | Owner | | |
| 4 | Thunderstorms | Switch (saves immediately, optimistic) | `weather_flag_thunder` | Owner | | |
| 5 | Snow & freezing temps | Switch (saves immediately) | `weather_flag_freeze` | Owner | | |
| 6 | Extreme heat | Switch (saves immediately) | `weather_flag_heat`. Enables the °F field | Owner | | |
| 7 | Extreme heat at or above (°F) | Numeric input | Whole number 70–130. Disabled when the heat flag is off | Owner | | |
| 8 | Save | Button | Saves the three thresholds. Enabled only when dirty and valid; refetches the forecast | Owner | | |
| 9 | Notifications | Inline link | Goes to `/settings/notifications` | Owner | | |

### `/settings/messages`: Client heads-up templates (`src/components/views/SettingsMessagesView.tsx`)

Five template cards: Rain delay, Schedule change, Start confirmed, Review request, Review reminder. Every card has the same controls.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Add your company name | Inline link (only when there is no company name) | Goes to `/settings/business-profile` | Owner | | |
| 2 | Email subject | Input per card | Edits the subject | Owner | | |
| 3 | Message | Textarea per card | Edits the body | Owner | | |
| 4 | Placeholder chips `{…}` | Buttons | Inserts the token at the cursor and refocuses the textarea | Owner | | |
| 5 | Unknown placeholder warning | Display | "Not a placeholder: {x}". A warning only; Save still works | Owner | | |
| 6 | Preview | Display | Filled from a real scheduled job with a client, or from sample data | Owner | | |
| 7 | Reset to default | Button (only if saved) | Deletes the saved template and restores the default text | Owner | | |
| 8 | Save | Button | Enabled when dirty and the body isn't empty. Toasts "{Template} saved" | Owner | | |

### `/settings/reviews` (`src/components/views/SettingsReviewsView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Summary: 30 days / 90 days | Toggle buttons | Switches the window for Requests sent / Clicked / Marked left / Click rate | Owner | | |
| 2 | Ask clients for reviews | Switch (draft) | `enabled`. When off, the sections below dim | Owner | | |
| 3 | Google review link | Input | `https://` is added on save when missing | Owner | | |
| 4 | Test link | Button | Opens the normalized URL in a new tab. Disabled when empty | Owner | | |
| 5 | Facebook / Yelp / Houzz / Angi | Inputs | Fallback review sites, used only when there is no Google link | Owner | | |
| 6 | When to ask: Complete / fully paid | Choice buttons | `ask_when` | Owner | | |
| 7 | Delay: Same day / 1 day / 3 days | Choice buttons | `delay_days` | Owner | | |
| 8 | Remind once if not clicked after (days) | Numeric input | 1–60; shows an inline error | Owner | | |
| 9 | Settings › Messages | Inline link | Goes to `/settings/messages` | Owner | | |
| 10 | Save (sticky) | Button | Enabled when dirty and valid. Toasts | Owner | | |
| 11 | Load | State | "Loading…" until the settings load, **and forever if the query errors** | Owner | | |

### `/settings/precon`: Pre-construction checklist (`src/components/views/SettingsPreconView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Move up / Move down | Icon buttons | Swaps sort order (two sequential saves, then refresh) | Owner | | |
| 2 | Item label | Inline input (saves on blur) | Renames the template item | Owner | | |
| 3 | "auto" badge | Display | Shown on auto-completing kinds | Owner | | |
| 4 | Required | Switch | Toggles required | Owner | | |
| 5 | Remove (trash) | Icon button | Removes or turns off the item, **with no confirmation**. It moves to "Turned off" | Owner | | |
| 6 | Add an item + Add | Input + button | Adds a required item at the end | Owner | | |
| 7 | Turned off: + {label} | Buttons | Re-activates the item | Owner | | |
| 8 | Remind me N days before the start | Numeric input | UI requires ≥1; the database allows only 1–60 | Owner | | |
| 9 | 811: working days to wait | Numeric input | UI requires ≥0; the database allows only 0–30 | Owner | | |
| 10 | 811: working days valid | Numeric input | UI requires ≥1 | Owner | | |
| 11 | Save | Button | Enabled when dirty and valid. Toasts "Saved" | Owner | | |

### `/settings/progress`: Progress updates (`src/components/views/SettingsProgressView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Crew updates need approval before sharing | Switch (draft) | `crew_needs_approval`, read by `crew_post_update` (0126:182) | Owner | | |
| 2 | Offer to text the client: each / daily / never | Choice buttons | `notify_mode`, read by ProgressUpdatesCard | Owner | | |
| 3 | Milestones per build type | Textarea per type (`defaultValue`, commits on blur) | One milestone per line. These form the client's progress tracker | Owner | | |
| 4 | Open portfolio › | Link | Goes to `/portfolio` | Owner | | |
| 5 | Save | Button | Saves the draft and toasts. No dirty check (always enabled) | Owner | | |
| 6 | Load | State | "Loading…", **and forever if the query errors** | Owner | | |

### `/settings/maintenance`: Maintenance reminders (`src/components/views/SettingsMaintenanceView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Template label | Inline input (saves on blur) | Renames | Owner | | |
| 2 | On | Switch | Sets the template `active` flag | Owner | | |
| 3 | Delete (trash) | Icon button | **Deletes the template with no confirmation** | Owner | | |
| 4 | Client description | Textarea (saves on blur) | The text the client sees in Care & maintenance | Owner | | |
| 5 | As needed | Switch | Hides the interval fields | Owner | | |
| 6 | Every N to M months | Two numeric inputs (save on blur) | 1–240. An invalid value is silently ignored (min) or cleared (max) | Owner | | |
| 7 | Remind in (month) | Select (Any month / Jan–Dec) | `remind_month` | Owner | | |
| 8 | Add item | Button per build type | Creates "New item", every 12 months | Owner | | |
| 9 | Add maintenance for another type | Select + Add button | Creates "Inspect & clean" for that type | Owner | | |
| 10 | Remind me N days before it's due | Numeric input | Save is disabled outside 1–180 | Owner | | |
| 11 | Warranty years per build type | Decimal input per type | Empty or ≤0 clears it. Shown to the client in the Hub | Owner | | |
| 12 | Save (reminders & warranty) | Button | Enabled when dirty and valid | Owner | | |
| 13 | Past completed jobs: Set up N past jobs | Button (only when there are candidates) | One-time bulk creation of maintenance items and warranties. Toasts the count | Owner | | |

---

### Employee shell (`src/components/layout/EmployeeLayout.tsx`, `src/components/layout/AppLayout.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Any non-`/employee` URL | Route guard | Redirects to `/employee` (AppLayout:93) | Employee | | |
| 2 | Owner visits `/employee*` | Route guard | Redirects to `/dashboard` (AppLayout:94) | Owner | | |
| 3 | CP / ContractorPro logo | Link | Goes to `/employee` | Employee | | |
| 4 | My time | Link | Goes to `/employee/time` | Employee | | |
| 5 | Name menu trigger | Dropdown button | Shows the employee name, or "Account" | Employee | | |
| 6 | Change password | Menu item link | Goes to `/employee/account` | Employee | | |
| 7 | Sign out | Menu item | Signs out and clears the query cache (auth.tsx:79) | Employee | | |
| 8 | No Sidebar / BottomTabBar / Assistant | Behaviour | The owner shell, the assistant and the owner background checks never run | Employee | | |
| 9 | Deactivated employee signs in | Behaviour | Still gets the employee shell (the role check ignores `status`). Every crew RPC returns nothing or throws | Employee | | |

### `/employee`: My projects (`src/components/views/EmployeeProjectsView.tsx`, `src/components/timesheets/CrewHomeCards.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Clock card: Clock out | Button (when clocked in) | `time_clock_out(0, null)`. Toast reminds you to add a break on My time | Employee | | |
| 2 | Clock card: Clock in {today's job} | Button (one job today) | `time_clock_in(project, today)` | Employee | | |
| 3 | Clock card: Clock in | Link (no single job today) | Goes to `/employee/time` | Employee | | |
| 4 | Clock card: week stats strip | Link | Goes to `/employee/time` | Employee | | |
| 5 | Today card | Card link (per job scheduled today) | Goes to `/employee/projects/:id/work-order`. Shows the address and job weather | Employee | | |
| 6 | Upcoming jobs rows | Links | Go to the work order | Employee | | |
| 7 | Project card (ListCard) | Card link | Goes to `/employee/projects/:id`. Shows a status pill | Employee | | |
| 8 | Loading / error / empty | State | "Loading…" / "Couldn't load your projects." / "You haven't been assigned…" | Employee | | |

### `/employee/projects/:id`: Project detail (`src/components/views/EmployeeProjectDetailView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | My projects | BackLink | Goes to `/employee` | Employee | | |
| 2 | Open work order | Button link | Goes to `/employee/projects/:id/work-order` | Employee | | |
| 3 | Schedule: forecast strip | Display | NWS forecast for the job dates (only when not complete) | Employee | | |
| 4 | Schedule: delays list | Display (canUndo=false) | Read-only rain-delay markers | Employee | | |
| 5 | Client selections | Display | Approved choices only, no prices (`employee_project_selections`) | Employee | | |
| 6 | Write an update | Textarea | Free-text note | Employee | | |
| 7 | Add photos | Button → file input (camera, multiple) | Uploads each photo as a `project_images` row with `uploaded_by_employee_id`. Shows a spinner | Employee | | |
| 8 | Post update | Button | Inserts into `project_notes` with the employee's name. Disabled when empty | Employee | | |
| 9 | Feed | Display | Notes and photos, newest first, from every employee on the project | Employee | | |
| 10 | Not assigned / unknown id | State | "Couldn't load this project." (`getAssignedProject` throws) | Employee | | |

### `/employee/projects/:id/work-order`: Crew work order (`src/components/views/WorkOrderPage.tsx`, `src/components/workorder/WorkOrderView.tsx`, `src/components/progress/PostUpdateSheet.tsx`)

The same view renders for the owner at `/projects/:id/work-order`, with a "Preview — this is exactly what your crew sees" banner and a Back to project link. The Role column says where each item differs.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Job | BackLink | Goes to `/employee/projects/:id` | Employee | | |
| 2 | Navigate | Button link (new tab) | Opens maps for the address | Employee / Owner | | |
| 3 | Offline banner | State | When the fetch fails, shows the last copy saved in localStorage, read-only | Employee / Owner | | |
| 4 | "New since you last opened this" | Display | Diff against the last open snapshot. The open is recorded (not for the owner) | Employee | | |
| 5 | Post update | Button (hidden for the owner and offline) | Opens PostUpdateSheet in crew mode | Employee | | |
| 6 | Sheet: Camera | Button → file input (capture) | Adds a photo | Employee | | |
| 7 | Sheet: Library | Button → file input (multiple) | Adds photos | Employee | | |
| 8 | Sheet: remove photo | Icon button per thumbnail | Removes it from the draft | Employee | | |
| 9 | Sheet: What got done today? | Textarea | Note | Employee | | |
| 10 | Sheet: Feature | Select | Links the update to a feature. Resets the milestone | Employee | | |
| 11 | Sheet: Milestone | Select (disabled until a feature is picked) | Marks a milestone | Employee | | |
| 12 | Sheet: Share with client | Switch | Crew: "The office approves it before the client sees it" (when approval is required) | Employee | | |
| 13 | Sheet: Post | Button | `crew_post_update`, background photo uploads, then `crew_finish_update`. Toast: "Posted — sent to the office for approval" | Employee | | |
| 14 | Reviewed | Button (lead only, when not reviewed at the current version) | `crew_review_work_order`. Toasts "Marked reviewed" | Employee (lead) | | |
| 15 | PDF | Button (lead or owner) | Rasterizes the diagrams and downloads the work-order PDF | Employee (lead) / Owner | | |
| 16 | Review status | Display | "Reviewed by X", or "Scope changed since X reviewed it" | Employee / Owner | | |
| 17 | Site: 811 ticket card | Display | Ticket #, clear-to-dig and expiry dates, warnings | Employee / Owner | | |
| 18 | Client: Call | tel: link | Hidden when `crew_hide_client_phone` is set | Employee / Owner | | |
| 19 | Client: Text | sms: link | Same | Employee / Owner | | |
| 20 | Crew notes photos | Thumbnail buttons | Open the zoom dialog | Employee / Owner | | |
| 21 | Feature block header | Collapse toggle | Expands or collapses scope, measurements, selections and changes. Shows a "Changed" badge | Employee / Owner | | |
| 22 | Materials: Log usage | Button per tracked line (`can_log_usage`, online only) | Opens LogUsageDialog | Employee (log usage) | | |
| 23 | Log usage dialog: quantity | Decimal input | Must be >0 | Employee | | |
| 24 | Log usage dialog: note | Input | Optional | Employee | | |
| 25 | Log usage dialog: save | Button | `crew_log_usage` | Employee | | |
| 26 | Photos grid | Thumbnail buttons | Zoom dialog (every project photo, including ones the client uploaded and the owner hasn't accepted yet) | Employee / Owner | | |
| 27 | Zoom dialog | Dialog | Full-size image; closes on overlay or X | Employee / Owner | | |
| 28 | No prices anywhere | Behaviour | The payload is whitelisted (`crew_work_order_json`); the crew never sees prices or costs | Employee | | |
| 29 | Load error | State | "Couldn't load this work order." | Employee / Owner | | |

### `/employee/account`: Change password (`src/components/views/EmployeeAccountView.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | My projects | BackLink | Goes to `/employee` | Employee | | |
| 2 | New password | Password input (min 6, required) | | Employee | | |
| 3 | Confirm password | Password input | Must match | Employee | | |
| 4 | Update password | Submit button | `supabase.auth.updateUser`. Toasts errors or "Password updated", then clears the fields. No current-password check | Employee | | |

### `/employee/time`: My time (`src/components/timesheets/EmployeeTimeView.tsx`, `TimeEntryDialog.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Clocked in: Break (min) | Numeric input | Floored, ≥0 | Employee | | |
| 2 | Clocked in: Note | Input | Optional | Employee | | |
| 3 | Clock out | Button | `time_clock_out(break, note)` | Employee | | |
| 4 | Not clocked in: project | Select (assigned, not lost/complete) | Picks the job | Employee | | |
| 5 | Clock in | Button | `time_clock_in`. Disabled until a project is picked | Employee | | |
| 6 | Previous period banner | Button | Jumps to the previous period when it's unsubmitted or rejected | Employee | | |
| 7 | Previous / Next period | Icon buttons | Navigates periods. Next is disabled in the current period | Employee | | |
| 8 | Rejected comment | Display | The owner's reason | Employee | | |
| 9 | Entry row | Button (only when editable; the running entry is locked) | Opens TimeEntryDialog | Employee | | |
| 10 | Add time | Text button per day (≤ today, editable) | Opens a new entry | Employee | | |
| 11 | Flag explanation | Input per non-blocking flag | Explains an overtime, long-day or rain-day flag | Employee | | |
| 12 | Note for the office | Textarea | Optional | Employee | | |
| 13 | Submit {range} | Button | `time_submit_week`. Disabled when blocked or while clocked in | Employee | | |
| 14 | Dialog: project / start / end / break / note | Select + inputs | Hours preview; "End time must be after the start" | Employee | | |
| 15 | Dialog: Delete | Button (existing entry) | Deletes the entry, **with no confirmation** | Employee | | |
| 16 | Dialog: Save | Button | `time_save_entry` | Employee | | |
| 17 | Load / error | State | `isLoading \|\| !ts` → "Loading…", **forever on error** (e.g. a deactivated employee, where `_me_employee` raises) | Employee | | |
| 18 | No pay shown | Behaviour | `my_timesheet` returns hours only, never a rate or amount | Employee | | |

### Employee reaching owner data (guards)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Type `/dashboard`, `/quotes`, `/invoices`, `/projects/:id` etc. | Route guard | Redirects to `/employee` | Employee | | |
| 2 | Public share links `/quote/:token`, `/invoice/:token`, `/receipt/:token`, `/change-order/:token` | Route (outside AppLayout) | Load normally (token-gated, same as anyone) | Employee | | |
| 3 | Direct REST read of quotes / invoices / price_book / expenses / cost plan / labor / payments | RLS | Returns nothing (owner `user_id` check plus the RESTRICTIVE "employees excluded", 0047 and later) | Employee | | |
| 4 | Direct REST read of `projects` | RLS | Returns nothing (0125:58 dropped the employee select policy; crew reads go through `crew_projects()`) | Employee | | |
| 5 | Direct REST insert into `project_images` for an assigned project | RLS | Allowed (0043:119). See observation S5 | Employee | | |
| 6 | If the `employees` lookup fails at sign-in | Behaviour | Role falls back to **owner** (auth.tsx:31-38), so the owner shell renders over empty data | Employee | | |

---

### `/portal`: Client Hub sign-in and shell (`src/components/portal/PortalLayout.tsx`, `PortalSignIn.tsx`, `src/lib/portalAuth.tsx`, `supabase/functions/portal-request-link/index.ts`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Loading | State | Spinner while the portal session resolves | Anyone | | |
| 2 | Email | Input (type=email, autofocus) | | Anyone | | |
| 3 | Send sign-in link | Submit button | Calls the `portal-request-link` function, which always returns the same generic response. A link is emailed only when the email matches a client row (rate limit: 3 per email and 8 per IP per 15 minutes). Shows "Sending…" | Anyone | | |
| 4 | Check your email screen | State | "If {email} matches an account… expires in 15 minutes" (hardcoded copy) | Anyone | | |
| 5 | Use a different email | Text button | Back to the form | Anyone | | |
| 6 | Magic link click | Behaviour | Lands on `/portal#access_token…`. `portalSupabase` (implicit flow, `detectSessionInUrl` only on /portal) picks it up. The main contractor session is untouched | Client | | |
| 7 | Contractor already signed in, same browser | Behaviour | Stays signed in as the contractor in the owner app. The portal session is separate | Owner / Client | | |
| 8 | Header: Client Hub | Display | | Client | | |
| 9 | Sign out | Button | `portalSupabase.auth.signOut()`. **Does not clear the react-query cache** | Client | | |
| 10 | Deep link while signed out | Behaviour | The sign-in form shows in place at the same URL | Anyone | | |

### `/portal` (index): PortalHome / project picker (`src/components/portal/PortalHome.tsx`, `PortalProjectPicker.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Record sign-in | Behaviour | `record_portal_sign_in` stamps `portal_last_sign_in_at` | Client | | |
| 2 | Exactly one project | Behaviour | Auto-redirects to `/portal/projects/:id` | Client | | |
| 3 | Several projects | List | "Your projects", with a project name and business name per row | Client | | |
| 4 | Project row | Link | Goes to `/portal/projects/:id` | Client | | |
| 5 | No projects | State | "We couldn't find a project linked…". **Also shown when the RPC errors** | Client | | |
| 6 | Lost projects | Behaviour | Hidden (0076) | Client | | |

### `/portal/projects/:id`: Project overview (`src/components/portal/PortalProjectOverview.tsx`, `src/components/client-hub/*`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Header: logo, company name, project, phase pill | Display | Logo shown through a signed URL | Client | | |
| 2 | Schedule update card | Display | Latest change on top, up to 4 earlier ones (reason: rain / weather / schedule only) | Client | | |
| 3 | Progress: milestone trackers | Display | Per feature: latest ✓ → next step | Client | | |
| 4 | Progress: before/after slider | Interactive slider | Drags to compare | Client | | |
| 5 | Progress: update photo | Thumbnail button | Opens the zoom dialog | Client | | |
| 6 | Progress: 👍 / Liked | Toggle button | `portal_react_progress` | Client | | |
| 7 | Progress: Comment | Text button → textarea + send | `portal_comment_progress` | Client | | |
| 8 | Care & maintenance (complete jobs only) | Display | Items, next suggested month, warranties. No prices | Client | | |
| 9 | Request service | Button | `portal_request_service` opens a pipeline opportunity and notifies the owner. Shows a thank-you or error line. The thank-you state is local only, so you can request again after a reload | Client | | |
| 10 | Don't remind me about maintenance | Checkbox | `portal_maintenance_opt_out` | Client | | |
| 11 | Pending quote banner | Button (one per sent quote) | Opens QuoteApprovalDialog | Client | | |
| 12 | Pending change order banner | Button (one per sent change order) | Opens ChangeOrderApprovalDialog | Client | | |
| 13 | Review card: Leave us a review | Link (new tab) | Goes to `/r/{token}` (complete jobs, reviews enabled, not "don't ask") | Client | | |
| 14 | Money: remaining balance / credit | Display | Invoiced, received, unpaid invoices | Client | | |
| 15 | Money: unpaid invoice View | Link | Goes to `…/documents/invoice/:id` | Client | | |
| 16 | Money: unpaid invoice Pay | Link | Goes to `…/documents/invoice/:id#pay`, which shows **instructions only (no online payment)** | Client | | |
| 17 | Your contract breakdown | Display | Original quote plus approved change orders, equals the contract value | Client | | |
| 18 | Your selections (approved) | Display | Locked choices with price labels and history | Client | | |
| 19 | Your selections: Open your quote | Link | Goes to the quote document ("Request a change" is there) | Client | | |
| 20 | Project history: Newest / Oldest | Toggle buttons | Sorts | Client | | |
| 21 | Project history row | Link (internal doc, `?v=` for old versions) or external `/receipt/:token` (new tab) | Opens the document or receipt | Client | | |
| 22 | Project history row: expand | Icon toggle | Shows details and an inner link | Client | | |
| 23 | Download project summary | Button | Builds the summary PDF client-side from the Hub payload | Client | | |
| 24 | Schedule card | Display | Start–end, with a progress label | Client | | |
| 25 | What we're building | Display | Approved original quote: required items plus the selected optional ones | Client | | |
| 26 | Photos: Add photo | Button → file input (camera) | Uploads to `projects/{id}/…` plus `portal_add_project_image` (hidden until the contractor accepts it). Toasts "Photo sent to your contractor" | Client | | |
| 27 | Photos grid | Thumbnail buttons → lightbox dialog | Only the client-visible photos | Client | | |
| 28 | Messages: thread | Display | You / Contractor bubbles, image thumbnails, timeAgo | Client | | |
| 29 | Messages: textarea | Textarea | | Client | | |
| 30 | Messages: Attach photos | Icon button → file input (multiple) | Adds file chips | Client | | |
| 31 | Messages: remove attachment | Icon per chip | Removes it | Client | | |
| 32 | Messages: Send | Icon button | Uploads the images, then `portal_send_message`. Clears the form on success | Client | | |
| 33 | Deliveries | Display + photo grid | Supplier, expected date, status (not shown while estimating) | Client | | |
| 34 | Activity | Display | Whitelisted `project_events` kinds with their summaries | Client | | |
| 35 | Unknown / other client's project | State | "That project isn't linked to your account." (**also shown on network error**) | Client | | |

#### Quote approval dialog (in PortalProjectOverview)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 36 | Optional item checkbox | Checkbox | `portal_set_quote_item_selection`, then refetch | Client | | |
| 37 | Selection group option | Buttons (ClientSelectionGroups) | Draft picks are auto-saved (`portal_set_quote_selection`) | Client | | |
| 38 | Selection option photo | Button | Zooms the image | Client | | |
| 39 | Your selections summary | Display | Missing required picks show in red | Client | | |
| 40 | Total / Deposit due | Display | Computed client-side (`clientQuoteTotal`, no tax) | Client | | |
| 41 | Decline | Button | Switches to decline mode | Client | | |
| 42 | Review & sign | Button (when there are selection groups) | Opens the review panel. Disabled while required picks are missing | Client | | |
| 43 | Type your name to sign | Input | Required in the UI (the server accepts an empty name) | Client | | |
| 44 | Back / Decline | Button | Leaves review, or goes to decline | Client | | |
| 45 | Approve | Button | `portal_approve_quote` sets approved, signed_at and IP, then the Won transaction. Toasts and closes | Client | | |
| 46 | Decline: reason | Textarea (optional) | | Client | | |
| 47 | Decline: Back / Confirm decline | Buttons | `portal_decline_quote` | Client | | |
| 48 | Quote view tracking | Behaviour | `useQuoteTracking` channel "hub" while the dialog is open | Client | | |

#### Change order approval dialog

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 49 | Items with signed amounts | Display | Negative lines show in red | Client | | |
| 50 | Change to your contract / schedule impact | Display | | Client | | |
| 51 | Type your name to sign | Input | Required in the UI | Client | | |
| 52 | Decline | Button | Decline mode | Client | | |
| 53 | Approve | Button | `portal_approve_change_order` | Client | | |
| 54 | Decline: reason + Back / Confirm decline | Textarea + buttons | `portal_decline_change_order` | Client | | |
| 55 | Long change order on a phone | Layout | **The dialog has no max-height or scroll** (line 812) | Client | | |

### `/portal/projects/:projectId/documents/:kind/:id`: Document view (`src/components/portal/PortalDocumentView.tsx`)

The contractor's Client view preview (`/projects/:projectId/client-view/documents/…`, mode="preview") renders the same page.

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Back to project | BackLink | Goes to `/portal/projects/:id` (or the client-view base) | Client / Owner | | |
| 2 | Print / Save as PDF | Button | `window.print()`. Logs `pdf_downloaded` for quotes (portal only) | Client / Owner | | |
| 3 | Versions: vN chips | Links | Switch `?v=`; the current one is marked | Client / Owner | | |
| 4 | Superseded banner: See the current version | Link | Drops `?v` | Client / Owner | | |
| 5 | Quote: Request a change | Text button per approved group (approved quote, current version, portal only) | Opens RequestSelectionChangeDialog | Client | | |
| 6 | Request dialog: option buttons | Toggle buttons (not the current picks) | Picks the option they'd like instead (optional) | Client | | |
| 7 | Request dialog: Note | Textarea | | Client | | |
| 8 | Request dialog: Cancel / Send request | Buttons | `portal_request_selection_change`. Needs an option or a note | Client | | |
| 9 | Invoice: How to pay (`#pay`) | Display | Offline payment instructions; no pay button | Client | | |
| 10 | Unknown document | State | "That document isn't available." | Client | | |

### `/r/:token`: Review redirect (`src/pages/ReviewRedirect.tsx`)

| # | Item | Type | What it should do | Role | Status | Note |
|---|---|---|---|---|---|---|
| 1 | Open link | Behaviour | Validates the uuid shape, calls `review_click` (logs the click, notifies the owner on the first click, runs the automation), then `location.replace(url)` | Anyone / Client | | |
| 2 | Continue | Link (fallback) | Goes to the review URL | Anyone | | |
| 3 | Invalid / no URL configured | State | "This review link isn't active anymore." | Anyone | | |
| 4 | Owner or employee opens the link | Behaviour | Redirects without counting the click | Owner / Employee | | |
| 5 | Reviews turned off, or request dismissed | Behaviour | **Still redirects and counts** (`review_click` doesn't check `enabled` / `dismissed`) | Anyone | | |

---

### Permissions matrix (as implemented)

R = read, W = write, — = none. "via RPC" means a SECURITY DEFINER function with its own gate. References are to `supabase/migrations/*` unless noted.

| Data area | Owner | Employee (active, assigned project) | Client (Hub session, JWT email = client email) |
|---|---|---|---|
| **Quotes** (sections, items, prices) | R/W own (`user_id = auth.uid()`). Restrictive exclusion for employees (0047) | — direct. R of the approved scope only (name, description, qty, unit, **no price**) via `crew_work_order_json` (0125:91-150) | R of sent / approved / declined quotes on their projects, **with prices**, via `get_portal_project` → `client_quote_json` (0113:41, 0113:519). W: optional items (`portal_set_quote_item_selection` 0117:412), selections (0115:447), approve (0075:241), decline (0065:122), request a selection change (0115:484) |
| **Prices / price book / catalog** | R/W own | — (0047 list: price_book, product_catalog, catalog_price_overrides) | Line prices on their quotes, COs and invoices only. Selection `price_delta` (not `cost_delta`) |
| **Costs** (cost plan, labor, overhead, margins, closeouts) | R/W own | — (0085:84/137/181, 0110:60, 0114:145). Can't read `projects.overhead_rate` / `target_margin_pct` since 0125 dropped the direct projects policy. Sees labor crew-days / man-hours in the work order (0125 `'labor'`) | — (not in the serializer. `clientSafe.ts` INTERNAL_FIELDS is a second, client-side filter that doesn't enforce anything) |
| **Invoices** | R/W own | — (0047) | R of sent / paid / overdue invoices on non-estimating projects (0113:129, 0113:437). Pay = instructions only |
| **Payments / receipts** | R/W own | — (0111:94) | R payments, receipts and money summary (0113:155, 0113:452). Public `/receipt/:token` for anyone with the token (0113:593) |
| **Pay rates / timesheets** | R/W own | Own hours only via `my_timesheet` / `time_*` RPCs (0131:527-657). Pay rates never visible (0131:139) | — |
| **Photos** (project_images + Storage) | R/W own (0023:116+) | R every photo on assigned projects, including client uploads (0043:108, storage 0043:185). W insert (0043:119, storage 0043:199). No constraint on `client_visible` | R `client_visible` photos only (storage 0064:34). R their own uploads (0067:67, **not path-scoped**). W upload to `projects/{their project}/` (0067:54) plus `portal_add_project_image` (0067:143, any path). R delivery photos (0064:53) |
| **Crew-note photos** | R/W (0125:320) | R (0125:326) | — |
| **Messages** (project_messages) | R/W own (0067:41) | — | R via `get_portal_messages` (0067:165). W via `portal_send_message` (0067:187). Message images R/W on `project-messages/` (0067:85/100) |
| **Project notes (crew feed)** | R/W (0043:149) | R, and W insert with own `employee_id` (0043:153/164) | — |
| **Progress updates** | R/W own. Approves crew posts | W via `crew_post_update` / `crew_finish_update` (0126:175). R via `crew_progress_updates` | R shared updates, comments, likes, milestones, before/after (0138:14). W like / comment / marketing consent (0126:235/246) |
| **Measurements** | R/W own | — direct (0091:52, 0098:49). R via the work order (`measurements` per feature, 0125) | — |
| **Schedule / delays** | R/W own. Rain delay RPCs (0121:311) | R dates and delays for assigned projects (0120:82, `crew_projects` 0125:75) | R dates when not estimating, plus schedule updates that are `client_visible`, not withdrawn and not `confirm` (0121 `client_schedule_updates_json`) |
| **Client contact** | R/W own | Name, plus phone unless hidden, plus "notes for crew" via the work order | Own name only |
| **Selections** | R/W | R approved picks, no prices (0115:551) | See Quotes |
| **Maintenance / warranty** | R/W | — (0127:103) | R the care block on complete jobs (0127:310). W request service / opt out (0127:344) |
| **Employees table** | R/W own employees (0043:38) | R own row (0043:44) | — (but see S1: can *create* employees via the Edge Function) |
| **Owner tables not in any exclusion list** (projects, business_profile, project_messages, opportunities, appointments, notifications…) | R/W own | — owner rows. **Can insert rows under its own uid** (0047 comment; `projects` isn't in the list) | Same as employee: a portal auth user is an ordinary `authenticated` user with no exclusion |

---

### Code observations (unverified)

All of these come from reading code and migrations. None has been reproduced against the live project. Security findings come first.

#### Security / permission leaks

- **S1 (critical). The `create-employee` Edge Function can mint a confirmed account for any email, and that email is the Client Hub identity.** `supabase/functions/create-employee/index.ts:84-118` only rejects callers who already have an `employees` row. Any other authenticated session can call it: a self-signup from AuthScreen (`src/lib/auth.tsx:108`), or a client's own portal session. It creates the account with `email_confirm: true` and a chosen password. Every portal gate is just `lower(c.email) = lower(auth.jwt()->>'email')` (`get_portal_project` 0113:519, `portal_approve_quote` 0075:241, `portal_send_message` 0067:187, …). So an attacker can create a login for a real client's email, as long as that email has no auth user yet, then read that client's quotes, invoices, payments and messages, and **sign or decline their quotes and change orders**.
- **S2. Portal identity doesn't require a confirmed email.** No portal function checks `email_confirmed_at`. If the Supabase "Confirm email" setting is off, a plain `signUp` with a client's email is enough on its own. `AuthScreen` handles both cases (`needsEmailConfirmation`), so the setting isn't known from code. Verify the dashboard setting.
- **S3. The portal-request-link gate can be bypassed.** The match check and rate limit only apply to the app's own button. Anyone can call Supabase Auth `/otp` directly with the public anon key; `inviteClientToHub` does exactly that from the browser (`src/lib/portalApi.ts:68-75`). The IP limit keys on the first `x-forwarded-for` hop (`portal-request-link/index.ts:82`), which the caller can spoof. `emailRedirectTo` is taken from the request body (`:127`), so it relies on Supabase's redirect allow-list. A matching email also does an extra OTP call, which is a possible timing oracle.
- **S4. The client-upload storage read is not scoped to the project folder.** `portal_add_project_image` accepts any `p_storage_path` (0067:143-160). The policy "portal own uploaded project images select" (0067:67-83) then lets that client read whatever object the path names, as long as it starts `projects/`, even another contractor's photo. The same pattern applies to message `image_paths` (0067:85 with `portal_send_message`). It needs a known path, and see S5b for where internal paths leak.
- **S5b. `client_progress_json` sends before/after photo paths without checking `client_visible`** (0138:33-41). Internal before/after photo paths reach the client. They fail to load (storage blocks them), but combined with S4 they become readable. At minimum the Hub shows broken sliders.
- **S5. A crew member can publish photos straight to the Client Hub.** The employee `project_images` insert policy (0043:119-130) doesn't constrain `client_visible`, `accepted`, `ba_role` or `progress_update_id`. A direct REST insert with `client_visible=true` skips the "crew updates need approval" setting (0126).
- **S6. The role check fails open to "owner".** `resolveEmployee` swallows errors and returns null (`src/lib/auth.tsx:31-38`), so an employee whose lookup fails gets the full owner shell and background owner jobs (AppLayout:26-72). RLS still blocks the data, but the UI and owner-only RPC attempts are exposed.
- **S7. Employee and portal auth users can create owner-type rows.** They can insert rows under their own uid into tables with no "employees excluded" policy, such as `projects` (missing from the 0047 list) and business_profile. For portal users no table has an exclusion at all. This is self-scoped with no leak, but the 0047 "no access at all" intent isn't met.
- **S8. `client_quote_json` / `client_invoice_json` whitelist `notes`** (0113:50, 0113:137), and the change order's `reason` (0113:92). Check in the builders that these fields are labelled client-facing and never used for internal notes.
- **S9. Client payments include `reference`** (check number or transaction id) (0113:163), and so does the public receipt. Deliveries expose the supplier name to the client (0113:470). Probably intended; confirm.
- **S10. `clientSafe.ts` is not a security boundary.** The raw RPC JSON already reaches the browser before `clientSafeProjectDetail` filters it (`src/lib/portalApi.ts:375-377`). Only the SQL whitelist protects data, and `clientSafe.test.ts` only tests the JS side.

#### Magic-link / session issues

- **M1.** Portal sign-out doesn't clear the shared react-query cache (`src/lib/portalAuth.tsx:34-49`). On a shared device, a second client who signs in the same tab can briefly see the previous client's `portal-project` / `portal-messages` data.
- **M2.** The offline work-order cache (`src/lib/workOrder.ts:127`, written at `WorkOrderView.tsx:78`) keeps client name, phone and address in localStorage after sign-out or deactivation.
- **M3.** "It expires in 15 minutes" is hardcoded (`PortalSignIn.tsx:36`). The actual OTP expiry is a Supabase Auth setting (default 1 hour).
- **M4.** `get_portal_project` has no email-verified check and matches trimmed-case email only. A client email saved with stray whitespace never matches.
- **M5.** The deactivated-employee login still works. The shell renders, `/employee/time` spins forever (M-state below), and the work order says "Couldn't load".

#### Dead / misleading settings

- **D1.** The Quote defaults "Sales tax %" isn't applied to quotes (tax was removed; `QuoteWorkspace.tsx:1025` comment). Only change orders use it (`ChangeOrderWorkspace.tsx:325`), on the whole subtotal, despite the "MA — materials only" note (`SettingsQuoteDefaultsView.tsx:98`). CLAUDE.md is also stale on this.
- **D2.** Quote validity's "Auto-expires after" (`SettingsQuoteDefaultsView.tsx:90`) isn't implemented. It only feeds the "Valid until" label (`QuoteWorkspace.tsx:1106`). The portal lets a client approve a quote past that date (0075:241 checks only `status='sent'`).
- **D3.** The Settings hub subtitle is demo data: "Rossi Hardscape", `DEMO_CREWS.length`, "pricebook updated Aug 30" (`SettingsView.tsx:40-43`). Real crews exist (Team page), so the count can disagree.
- **D4.** `/r/:token` ignores `review_settings.enabled` and dismissed requests (0122 `review_click`). A link sent earlier keeps working and counting clicks after reviews are turned off.

#### Validation gaps

- **V1.** Quote defaults deposit % has no upper bound, and a typed negative is accepted (`SettingsQuoteDefaultsView.tsx:155`, only `min="0"` attr).
- **V2.** Precon UI bounds are looser than the DB CHECKs (warn_days 1–60, locate_wait_days 0–30, 0124:26-27), so the user gets a raw constraint error toast (`SettingsPreconView.tsx:59`).
- **V3.** Business profile: no email, phone or URL validation; crew end time can be before start; negative alert thresholds (`SettingsBusinessProfileView.tsx:158-253`).
- **V4.** Add employee: `type=email` without a form submit means the browser never validates the format (`SettingsEmployeesView.tsx:263-289`).
- **V5.** Selection template Price/Cost: non-numeric text silently becomes 0 (`SettingsSelectionTemplatesView.tsx:114`).
- **V6.** `portal_approve_quote` / change order approval accept an empty `signed_by` server-side (0075:254). Only the UI requires a name.
- **V7.** Destructive actions with no confirmation: delete selection template (`:84`), delete crew (`SettingsTeamView.tsx:121`), deactivate employee (`SettingsEmployeesView.tsx:216`), delete pay rate (`PayRatesEditor.tsx:61`), delete automation (`SettingsNotificationsView.tsx:237`), remove precon item, delete maintenance template, delete time entry (`TimeEntryDialog.tsx:111`).
- **V8.** Load failure overwrites saved settings. Business profile and Quote defaults seed the draft from the fallback when the query fails, and Save stays enabled (`SettingsBusinessProfileView.tsx:34,289`; `SettingsQuoteDefaultsView.tsx:25,121`). One click can overwrite the real row with defaults.
- **V9.** Portal messages and photos report success on a silent no-op. `portal_send_message` / `portal_add_project_image` just return when the email doesn't match (0067:160, 0067:205), so the client sees success and the upload is orphaned.

#### Missing loading / empty / error states

- **E1.** `SettingsReviewsView.tsx:58` and `SettingsProgressView.tsx:32` show "Loading…" forever if the query errors.
- **E2.** `EmployeeTimeView.tsx:93` (`isLoading || !ts`) shows "Loading…" forever on error.
- **E3.** Notifications and Weather switches stay disabled with no message on load error (`SettingsNotificationsView.tsx:139`, `SettingsWeatherView.tsx:98`).
- **E4.** Estimating insights and Selection templates have no loading state; the empty-state copy flashes while loading.
- **E5.** Portal treats a network error as "not linked": PortalHome (`:46`), PortalProjectOverview (`:92`) and PortalDocumentView all show the "not yours" message on error.
- **E6.** The Lead sources ROI card silently disappears if `getMarketingSettings` fails (`SettingsLeadSourcesView.tsx:217`).
- **E7.** The Care "Request service" thanks is local state only (`CareSection.tsx:25`), so after a reload the client can request again. Opportunity dedupe depends on `_maintenance_opportunity`.

#### Mobile risks

- **R1.** The portal Change order approval dialog has no `max-h`/`overflow-y-auto` (`PortalProjectOverview.tsx:812`). A long change order pushes Approve off-screen on phones. The quote dialog has it.
- **R2.** The Selection template option row is `grid-cols-[1fr_90px_90px_auto_auto]` (`SettingsSelectionTemplatesView.tsx:145`). At 390px the name column gets squeezed to a few characters.
- **R3.** The EmployeeLayout header (logo, "My time", full employee name) has no truncation (`EmployeeLayout.tsx:42`). A long name can overflow at 360–390px.
- **R4.** The Assigned projects list on Manage employees lists every project with no search (`SettingsEmployeesView.tsx:199`). It's hard to use once there are many jobs.
- **R5.** The Maintenance template row puts 2 inputs, a select and switches inline (`SettingsMaintenanceView.tsx` TemplateRow). It wraps, but it's dense on phones and the month select is `w-32`.

---

