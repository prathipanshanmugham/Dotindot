# PRD — Dotindot Internal Operations & Growth Platform

## Product Description
Internal web app (FARM: FastAPI + React + MongoDB) for Dotindot Creative, an AI-first digital marketing & web dev agency. Replaces spreadsheets with one unified ops platform. Planned modules: Finance, Clients, Sales, CEO Dashboard, Employees, Logs, Partnerships, Reports. Currency: INR (₹), `currency` field stored on money-bearing records for future multi-currency. Branding: "dotindot." orange gradient (#F26B21 → #FBA834), light Notion × ERP aesthetic, chart-first (recharts), Plus Jakarta Sans.

## Architecture
- Backend: FastAPI (`/app/backend`), all routes under `/api`, openapi at `/api/openapi.json`. Files: server.py, database.py, auth.py (bcrypt + PyJWT + Fernet encryption for credential secrets), models.py, routes_auth/users/clients/projects/misc.py, seed.py (idempotent, $setOnInsert).
- DB: MongoDB via motor. Collections: users, clients, projects, activity_logs. String uuid `id` fields, `_id` excluded from responses.
- Frontend: React 19 + shadcn/tailwind + recharts, JWT bearer in localStorage, axios interceptor (`src/lib/api.js`), AuthContext, AppLayout (sidebar + topbar search + user menu).
- Auth: JWT bearer via POST /api/auth/login (12h token). RBAC via `require_roles` dependency. Roles: admin, finance, sales, pm, employee.
- RBAC matrix: clients read = admin/pm/sales/finance; clients write = admin/pm/sales; delete = admin/pm; credential reveal = admin/pm; user mgmt + logs = admin; employee sees only assigned projects.
- Credentials/keys: JWT_SECRET + CRED_ENCRYPTION_KEY in backend/.env. Seeded creds in /app/memory/test_credentials.md (all users password: Dotindot@2026).

## Phase Status
### Phase 1 — DONE (Sept 7, 2026) ✅ tested (iteration_1: 24/24 backend, all frontend flows)
- Auth & RBAC (5 roles, seeded users, activity logging of login + client/project create/edit/delete + credential reveals)
- App shell: role-filtered sidebar (employee: Dashboard + Projects only), central search (clients + projects, navigating dropdown), role badge, logout
- Role-based dashboard: welcome, count stats, projects-by-status bar, clients-by-status donut, expiring-contracts (<30d) queue
- Clients module (full): filterable list w/ donut+bar header, per-client dashboard (health badge healthy/watch/at-risk, tabs: Overview charts, Projects, Contacts, Contracts w/ 30-day expiry flags, masked Credentials w/ admin-pm reveal + add/delete, Details, Notes), add/edit/delete client dialog
- Projects: 5-step guided wizard, filterable list + status chart, detail (milestones timeline, toggleable deliverables, team, budget ₹), employee scoping
- Admin user management (create, role assign, deactivate)
- Seed: 10 clients (India + Dubai + London, 2 contracts expiring <30d), 15 projects (₹50k–₹15L), idempotent

### Phase 2 — Finance Module — DONE (Sept 7, 2026)
- Backend `routes_finance.py` + `seed_finance.py` (idempotent, Apr–Sep 2026 history) + `storage.py` (Emergent Object Storage for receipts; EMERGENT_LLM_KEY in backend/.env)
- General Ledger: /api/finance/transactions (date-range/type/category/client/project filters, totals), CRUD, monthly trend + category donut charts, presets (this month/last month/quarter/YTD)
- Expenses workflow: submitted→approved→paid / rejected, server-side enforcement (400s), approval auto-posts ledger tx, receipt upload (multipart) + view, status tabs UI
- My Expenses page (/my-expenses): all roles submit + track own submissions
- Subscriptions: normalized monthly burn (₹1,12,983), renewal alerts <30d (3 seeded), spend-by-tool chart, CRUD
- Budgets: /api/finance/budgets/report?period= (YYYY-MM or YYYY-Qn), actual-vs-budget bars, overspend flagged red with % over (ai overspent in 2026-09), unbudgeted spend listing
- AI Spend sub-ledger: per-tool bar, monthly trend, per-client attribution, AI subscriptions
- Marketing: campaigns CRUD (channel meta/google/linkedin/other), attributed income via campaign_id on income tx, ROI per channel chart (overall 1.73x)
- Project profit: revenue − (linked expenses + cost_allocation), ranked list + chart, P&L section on project detail page; pm scoped to assigned projects
- Employee revenue: even split of project income among assigned members, ranked list + per-employee monthly trend
- Finance RBAC: full access admin+finance; expense submit + own-list for ALL roles; project-profit for admin/finance/pm(scoped); everything else 403 for sales/employee
- Finance actions logged to activity_logs (create/approve/reject/pay/etc.)
- Frontend: FinanceLayout sub-nav + 9 finance pages under src/pages/finance/, sidebar updated (Finance for admin/finance, Project Profit for pm, My Expenses for sales/pm/employee)

### Phase 3 — Sales & Marketing + CEO Dashboard — DONE (Sept 7, 2026)
- Backend: routes_sales.py (leads pipeline with stage_history, CRM activities, follow-ups, atomic won→client conversion with double-conversion guard, quotes with auto QTN-YYYY-NNN numbering + server-side totals + 18% GST + lazy auto-expire, targets vs actuals from won leads, /api/sales/overview conversion metrics) + routes_ceo.py (/api/ceo/dashboard admin-only, 8 metric groups, period + prev-period comparison) + seed_sales.py (idempotent: 18 leads lead-01..18, 11 activities, 8 quotes sales-quote-01..08/QTN-2026-001..008, 4 targets sales-target-01..04, quote counter)
- Sales RBAC: write = admin+sales; read = admin/sales/pm/finance; employee 403 on all /api/sales/*; /api/ceo/dashboard admin-only
- Conversion flow: won lead → convert dialog (new client prefilled or link existing) → optional project wizard prefill (?client&budget); converted leads stage-locked, lost can't convert, second attempt 400
- CEO metrics: MRR (active retainer contract value ÷ duration months; ARR=×12; 6-mo trend), CAC (ledger marketing spend ÷ won leads in period), revenue/employee, retention/churn (current status counts, labeled), margin + trend, pipeline by stage, headcount & utilization, revenue by region + top-3 (global expansion panel); every card has drill-down link
- Frontend: SalesLayout sub-nav + SalesOverview (funnel, conversion pills, source donut, follow-ups due, targets), PipelinePage (kanban 6 stages + stage select + filters + new-lead dialog), LeadDetailPage (stage stepper, activity timeline, convert dialog, quotes), QuotesPage, QuoteBuilderPage (live totals, GST toggle), QuoteViewPage (branded print-friendly layout, @media print CSS), TargetsPage, CeoDashboard (admin landing replaces generic dashboard; role-based HomeDashboard switch)
- Verified via curl: employee/pm 403s, 18 leads, double-conversion 400, lost-convert 400, win rate 57.1%, avg deal ₹10.6L, time-to-close 50.8d, targets (team Sep 62% behind / sales Sep 108% on-track), QTN-2026-008 auto-expired, CEO MRR ₹6.49L / ARR ₹77.9L / margin 70.1% / util 66.7% / top regions India-UAE-UK

### Phase 4 — Employees, Logs, Partnerships, Locations — DONE (Sept 7, 2026)
- Employees: routes_employees.py — directory (`/api/employees`, all roles, search/role/city filters), profile page (`/api/employees/{id}`: projects + training + performance stats; employee self-only), profile edit (admin any / self), training courses CRUD (admin+pm) + assignments (assign, progress 0-100 w/ auto status, complete, remove; assignee can self-update)
- Logs module: routes_logs.py — paginated `GET /api/logs` (filters user/action/entity_type/date range), `/api/logs/meta` (filter options + purge info), `POST /api/logs/purge` manual trigger; scheduler.py — APScheduler DAILY job 02:30 UTC purging logs >90 days, every run recorded in `purge_runs` (deleted_count, trigger); LogsPage UI: retention info strip (90d / last run / next run / purgeable count), filters, pagination, purge-now AlertDialog
- Partnerships: routes_partnerships.py — CRUD (write admin+finance, read staff, employee 403), stats (`/api/partnerships/stats`: active, renewing ≤60d, annual cost, unused benefit ₹ total), benefit mark-used/unused toggle updating totals; UI with stat cards, amber renewal alert strip, benefit rows w/ ₹ credit values
- Locations: routes_locations.py — hardcoded CITY_COORDS lookup (13 cities, no geocoding API), `/api/locations/map` groups clients/branches/employees per city; react-leaflet 5 + OpenStreetMap map with toggleable colored pin layers (clients orange, branches dark, team blue), popups linking to records, city summary list
- Seed (seed_phase4.py, idempotent): 3 new employee users (designer/dev/marketing@dotindot.com), profile enrichment for all 8 users, 5 courses, 10 assignments, 6 partnerships (2 renewing <60d; ₹1.85L unused benefits), 2 branches (Mumbai HQ, Dubai), 13 aged logs (10 purgeable >90d) guarded by seed_flags
- Sidebar: Employees (all roles), Partnerships/Locations (staff), Logs (admin) now live; only Reports + Settings remain placeholders

### Phase 5 — Reports & Exports (FINAL) — DONE (Sept 7, 2026)
- Export infrastructure: export_engine.py (branded Excel via openpyxl: orange styled headers, ₹ number formats, auto column widths, freeze panes; branded PDF via reportlab: orange dotindot header band with D-dot logo, generated-by/date footer, page numbers, ₹ glyph via DejaVu, landscape for wide tables)
- routes_exports.py: GET /api/exports/{dataset}?format=pdf|xlsx for 16 datasets honoring active filters + per-dataset RBAC; single-quote branded PDF GET /api/exports/quote/{id}; every export logged (report_exported) to activity_logs
- routes_reports.py: 4 templates (Monthly Financial Summary admin/finance, Client Status admin/finance/pm, Sales Pipeline admin/sales, Employee Activity admin) with period picker → on-screen preview (summary stats + section tables) + PDF/Excel download; custom builder (6 modules: clients, projects, ledger, expenses, leads, quotes — date range, module filters, column checkboxes, 20-row preview, export); employee 403 on all /api/reports/*
- Notifications: GET /api/notifications role-filtered (contracts ≤30d staff; subscriptions ≤30d + partnerships ≤60d + pending expense approvals admin/finance; overdue lead follow-ups admin/sales; overdue training for employee); NotificationsBell in top bar with count badge + dropdown
- UI: Export ▾ (PDF|Excel) on all 16 list pages passing live filters; Download PDF on quote view; ReportsPage + SettingsPage live; ALL placeholders and "Soon" badges removed — platform is feature-complete
- Cleanup: stale @dotindot.test users deleted on every startup (ignore-proof)

### Phase v2 — Major Upgrade: Granular Access, Growth & Ops Modules — DONE (Sept 2026)
- Branding/Auth: favicon D-mark + title "dotindot | Internal Platform", gradient wordmark, demo-login buttons REMOVED (real auth only), accounts migrated to @dotindot.in, new `super_admin` role (admin@dotindot.in), new admin Midhun (midhun@dotindot.in), new roles ads_manager (ads@dotindot.in) + social_manager (social@dotindot.in)
- Granular permissions (permissions.py): registry of keys grouped Core/Finance/Sales/Growth/Operations/System; role defaults ± per-user overrides; HTTP middleware enforces path-prefix → permission key (403); `GET /api/me/permissions`; Access Control screen `/access` (matrix + overrides + branch assignment + reset) for super_admin/admin
- Branch/location scoping: users with `assigned_branches` see only records tied to those branches across clients/projects/leads/search
- New modules: Assets (laptops/equipment, assign/return history, maintenance logs + due alerts, stats), Ads (manual campaigns w/ platform, spend, metric snapshots, ROAS; campaign detail page), Social (post scheduling calendar view + status workflow), Influencers (directory, per-platform rate cards, collaborations linking clients), Sales HUD (`/hud` fullscreen dark TV mode: targets vs actuals hero, pipeline, leaderboard, 45s auto-refresh, ESC exit)
- Cross-cutting UI: permission-driven sidebar (Core/Growth/Operations/System groups from /api/me/permissions), client detail Growth tab (ads/social/influencer rollup via /api/clients/{id}/growth-rollup), CEO dashboard "Performance by branch" panel (/api/locations/compare), employee profile Assets tab, notifications bell + asset maintenance + social post alerts, Reports upgraded visual-first (all 6 templates return `charts` rendered as recharts donut/bar + summary cards + tables; 2 new templates: ads-performance, location-comparison), Locations page Branch CRUD (admin), Users page new role options, Export menus on all new list views (19 datasets)
- Seed (seed_v2.py, idempotent): email migration, London branch (seed-branch-03), branch assignments, assets, ad campaigns, social posts, influencers

## Prioritized Backlog (post-launch ideas)
- P2: multi-currency, email alert digests, scheduled auto-generated monthly reports, quote e-signature

## User Personas
- Admin/CEO (Arjun): full access, user management, logs
- Finance (Priya): clients read, finance module (future)
- Sales (Rohan): client/project creation, leads (future)
- PM (Sneha): client/project management, credential reveal
- Employee (Karan): only assigned projects + dashboard
