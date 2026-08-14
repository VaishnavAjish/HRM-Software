# MASTER PROMPT — DOMAIN 02: Enterprise & Organization Management (Foundation)

> **Target stack:** the **Salary Management Portal** — Laravel backend at `salary-slip-bac/` + React frontend at `salary-slip-front/salary-slip-front/`.
> **Scope of this document:** Phase 1 (Foundation) is fully specified. Phase 2 (02.05–02.09) are sketched as follow-on phases at the end.
> **Purpose:** this file is a self-contained instruction set for an AI coding agent. The agent must read the cited reference files before writing anything, then implement, test, and verify.
> **Status date:** 2026-08-14. Treat `docs/ARCHITECTURE-AND-WORKFLOWS-2026-08-11.md` as the current source of truth where older docs disagree.

---

## 0. What you are building

DOMAIN 02 — **Enterprise and Organization Management**. This phase delivers the foundation for a single-tenant HRMS that is simultaneously multi-company (companies act as tenants) and multi-unit (a unit name is not globally unique). Subdomain coverage:

| ID | Subdomain | Phase 1 (this prompt) | Deliverable |
|---|---|---|---|
| 02.01 | Enterprise Master | **FULL** | Extend the existing `companies` record with enterprise attributes + a read/update surface under an "Organization" workspace. |
| 02.02 | Legal Entity Management | **FULL** | New `legal_entities` table + full CRUD (employing entity per company, country, tax/registration). |
| 02.03 | Business Structure | **FULL** | New `locations` table (branch/site/warehouse/office) with parent hierarchy. |
| 02.04 | Branch / Location Management | **FULL** | CRUD for `locations` + user assignment (`user_locations`) + member management. |
| 02.10 | Calendars / Calendar Management | **FULL** | New `calendars` + `calendar_holidays` tables, work-week definitions, holiday CRUD. |
| 02.05 | Financial Organizational Structure | Phase 2 | Sketch only (§8). |
| 02.06 | Organizational Hierarchy | Phase 2 | Sketch only (§8). |
| 02.07 | Reporting Structure | Phase 2 | Sketch only (§8); align with existing `reporting_relationships`. |
| 02.08 | Organizational Chart | Phase 2 | Sketch only (§8). |
| 02.09 | Change Management | Phase 2 | Sketch only (§8). |

**Non-goals (do not build):** 02.05–02.09 in this phase; no import/export of calendars; no changes to `users.company_code`, the authorization engine, `ScopeMatcher`, or the Permission Matrix UI; no touching the `enterprise-rbac/` directory (dormant, disconnected).

---

## 1. Ground truth — read these files first (they define the rules)

Read every one of these before writing a single line:

**Backend (`salary-slip-bac/`):**
- `routes/api.php` — single home for all API routes; note the `jwt.auth` wrapper and the `v1/admin` company/unit block (~lines 316–345) which is the pattern to copy.
- `app/Http/Controllers/Api/V1/Admin/CompanyUnitController.php` — the canonical thin V1 controller (constructor DI, `missing()`, `guarded()`, inline validation).
- `app/Services/Admin/CompanyUnitService.php` — the canonical service (queries, `present*()` mappers, `DB::transaction`, `AuditLogger`, `AuthorizationCache`, guard rules throwing `ProvisioningException`).
- `app/Services/Provisioning/ProvisioningException.php` — exception contract (`errorCode`, `status`).
- `app/Models/Company.php`, `app/Models/Unit.php` — canonical small models (`$fillable`, modern `casts()` method, docblocked *why*).
- `app/Http/Middleware/RequireModuleSchema.php` — the `module.schema:` gate; you will **add an `organization` module** to its `MODULES` map.
- `database/seeders/CompanyUnitPermissionSeeder.php` — the exact permission-seeding pattern to mirror for `OrganizationPermissionSeeder`.
- `database/migrations/2026_08_11_000001_create_companies_table.php` and `...000004_create_units_tables.php` — migration conventions (anonymous class, `Schema::hasTable()` guard, `$table->id()`, explicit lengths, compound unique, FK `cascadeOnDelete`).
- `app/Support/PermissionRegistry.php` — canonical permission catalog (`NODES`). New `org.*` codes must be registered here so `authz:sync-catalog` and the `/v1/authorization/me` snapshot know them.
- `app/Http/Controllers/Admin/Hr/Concerns/ScopesCompany.php` + `app/Support/CompanyMembership.php` — the company-string scoping primitive; V1 services must validate any `company_id`/`company_code` the caller claims against `CompanyMembership::parse()`.

**Frontend (`salary-slip-front/salary-slip-front/`):**
- `src/utils/api.js` — `apiRequest(path, options)` returns the parsed JSON envelope (`{success, data}`); rejects with `Error{status, data}`; `authHeaders` is **private** → feature modules define their own. **Do NOT add the new API surface here.** Create a feature module service instead.
- `src/features/permissionMatrix/services/permissionMatrixApi.js` — the canonical feature-module service pattern.
- `src/pages/admin/accessControl/CompanyUnits.jsx` — the canonical CRUD page (load, filters, modals, `run()`, permission gating). **658 lines, read it all.**
- `src/pages/admin/accessControl/CompanyUnits.test.jsx` — the canonical test file. **Copy its mocking style exactly.**
- `src/hooks/useAuthorization.js` — `can(code)` for gating; `useAuth()` gives `user.accessToken` / `user.tokenType`.
- `src/components/layout/useNavItems.js` — `getAdminNav(...)`; add the "Organization" section here.
- `src/App.jsx` — routes are nested under `/admin`, every page is `React.lazy`, gated with `<ProtectedRoute requiredPermission="...">`.
- `src/components/layout/AppLayout.jsx` — the `pageTitles` map; add entries for the new paths.
- `src/components/ui/` — read `Button`, `Modal`, `Badge`, `Card`, `Pagination`, `SearchBar`, `Drawer`, `DatePicker`, `Skeleton` for prop signatures (summarised in §5).
- `vite.config.js`, `vitest.config.js`, `package.json` — scripts: `dev`/`build`/`lint` (`eslint .`)/`test:frontend` (`vitest run`).

---

## 2. Hard constraints (non-negotiable)

1. **PostgreSQL only.** No `$table->enum()` (use strings), no UUID PKs (`$table->id()` bigint everywhere), no `$guarded` (**use `$fillable`**), no soft deletes for master data (**use `is_active`**; `User` is the exception and it uses `is_deleted`).
2. **No `tab` param on the backend.** Tab is frontend-only UI state (see CompanyUnits.jsx). Route count is the source of truth.
3. **Response envelopes are strictly one of two shapes:**
   - V1 controllers: `{success: true, data: ...}` for success; `{success: false, error: {code: 'UPPER_SNAKE', message: ...}}` for errors (404 → `NOT_FOUND`, 403 → `PERMISSION_DENIED` handled by middleware, 422 → domain guards, 201 on create, delete returns `{success: true, data: {id}}`).
   - Do **not** use the legacy `{status: true, data}` shape in new V1 code.
4. **Authorization is route-level middleware only**: `->middleware('permission:<code>')`. Controllers never decide "who" — only "does this record exist" (`missing()`) and "is this mutation legal" (`guarded()`).
5. **Company tenancy is authoritative.** Any request that names a `company_id` (or `company_code`) must be validated in the service against the caller's authorized set via `CompanyMembership::parse()`; a caller who claims a company they do not belong to gets 403. Super admins (role 0/1 or the `all`/`all-companies` sentinel) bypass.
6. **Migrations:** anonymous class, guard with `Schema::hasTable()`/`Schema::hasColumn()`, zero-padded sequence continuing today's date (`2026_08_14_000001`, `000002`, … — note `2026_08_14_000000` is already taken), composite indexes lead with `company_id`, FKs use `cascadeOnDelete` unless the child must outlive the parent.
7. **New tables never re-introduce the dropped legacy ones.** `locations`, `branches`, `teams`, `approval_levels` were dropped on 2026-08-03. Build new tables fresh, with `company_id` FKs. A unit name is not globally unique — everything location/calendar-ish scopes by `company_id`.
8. **Every mutation is audited** via `App\Support\AuditLogger::log(...)`; membership changes that affect a user's visible scope call `AuthorizationCache::invalidate($tenantCode)`.

---

## 3. Data model — Phase 1 migrations

Create one migration per numbered item, in this order. After them, register the `organization` module (§4) and the permission seeder (§4).

### M1 — Extend `companies` with enterprise attributes (`add_enterprise_attributes_to_companies_table`)
Guard every column with `Schema::hasColumn()` so the migration is idempotent; add, all nullable:
- `legal_name` string 190
- `registration_number` string 100
- `tax_identification` string 100 (PAN/TIN/GST style)
- `incorporation_date` date
- `country_code` char 2
- `timezone` string 64 (default `Asia/Kolkata`)
- `primary_address` text
- `contact_email` string 190
- `contact_phone` string 32
- `fiscal_year_start` char 5 (e.g. `04-01`)
- `currency` char 3 (default `INR`)

Do **not** touch `code`, `name`, `is_active`, or any user scoping. Update `app/Models/Company.php` `$fillable` + add casts for the boolean/no date casts and `$hidden = []` care. Add relations `legalEntities()`, `locations()`, `calendars()`.

### M2 — `create_legal_entities_table`
- id, `company_id` FK companies `cascadeOnDelete`
- `code` string 60, `name` string 190, `legal_name` string 190
- `registration_number` string 100 nullable
- `country_code` char 2, `tax_id` string 100 nullable, `currency` char 3 default `INR`, `fiscal_year_start` char 5 nullable
- `primary_address` text nullable, `contact_email` string 190 nullable, `contact_phone` string 32 nullable
- `is_primary` boolean default false, `is_active` boolean default true, timestamps
- `unique(['company_id', 'code'])`, `unique(['company_id', 'registration_number'])` (Postgres treats NULLs as distinct, safe), index `company_id`, index `is_active`

### M3 — `create_locations_table` (02.03 + 02.04)
- id, `company_id` FK companies `cascadeOnDelete`, `parent_id` FK locations.id **`nullOnDelete`** (0-level branch has NULL)
- `code` string 60, `name` string 190
- `kind` string 20 default `branch` — allowed values `branch | site | warehouse | office` (string column, enforced in service, mirrors the codebase's string-column style)
- `is_active` boolean default true
- `address` text nullable, `city` string 120 nullable, `state` string 120 nullable, `country_code` char 2 nullable, `postal_code` string 20 nullable, `latitude` decimal(10,7) nullable, `longitude` decimal(10,7) nullable
- `contact_email` string 190 nullable, `contact_phone` string 32 nullable
- timestamps; `unique(['company_id', 'code'])`; index `company_id`; index `parent_id`

### M4 — `create_user_locations_table` (assignment pivot)
- `user_id` FK users `cascadeOnDelete`, `location_id` FK locations `cascadeOnDelete`
- `unique(['user_id', 'location_id'])`, index `location_id`

### M5 — `create_calendars_table`
- id, `company_id` FK companies `cascadeOnDelete`, `unit_id` FK units **`nullOnDelete`** (NULL = company-default calendar; per-unit calendars override)
- `name` string 140, `description` text nullable
- `work_week` jsonb nullable (array of 3-letter day keys, e.g. `["mon","tue","wed","thu","fri"]`; NULL = Mon–Fri default)
- `is_active` boolean default true, timestamps
- `unique(['company_id', 'unit_id', 'name'])`, index `company_id`, index `unit_id`

### M6 — `create_calendar_holidays_table`
- id, `calendar_id` FK calendars `cascadeOnDelete`
- `date` date, `title` string 190
- `kind` string 20 default `holiday` — `holiday | optional | workday` (a `workday` kind can only be added to an otherwise-non-working weekly pattern)
- `is_half_day` boolean default false, `recurring` string 10 nullable (`annual` or NULL)
- timestamps; unique `['calendar_id', 'date']`; index `calendar_id`; index `(calendar_id, date)`

### Models
`App\Models\LegalEntity`, `App\Models\Location`, `App\Models\Calendar`, `App\Models\CalendarHoliday` — follow the `Company`/`Unit` style exactly: `$fillable`, `casts()` method, relations (`Location::parent()/children()`, `Calendar::unit()`, `Calendar::holidays()`, `CalendarHoliday::calendar()`, `LegalEntity::company()`, `Location::company()/members()` via `belongsToMany(User::class, 'user_locations')`), and a docblock explaining the one non-obvious rule (e.g. "a unit is not global; unique is (company_id, code)").

---

## 4. Permissions, catalog, and schema gate

### New permission codes (namespace `org.`)
| Code | Level | Sensitive | Notes |
|---|---|---|---|
| `org.master.read` | ADMINISTRATION | no | Open Organization workspace / read enterprise attributes |
| `org.master.update` | ADMINISTRATION | yes | Edit enterprise attributes on a company |
| `org.legal_entity.read/create/update/status/delete` | ADMINISTRATION | writes yes | Full CRUD 02.02 |
| `org.location.read/create/update/status/delete` | ADMINISTRATION | writes yes | Full CRUD 02.03/02.04 (update also covers member assignment) |
| `org.calendar.read/create/update/status/delete` | ADMINISTRATION | writes yes | Full CRUD 02.10 (update covers holiday write) |

### Step 1 — Register in `app/Support/PermissionRegistry.php`
Add every code to `NODES` with correct metadata (`type` = ACTION for leaf perms, `parent` = a new `organization` family node, `level` = ADMINISTRATION, `sensitivity`, `route` where sensible). The `authz:sync-catalog` command and the `/v1/authorization/me` snapshot both read this; without it the frontend `can('org.*')` and the Permission Matrix will not recognise the keys.

### Step 2 — Seeder + migration
Create `database/seeders/OrganizationPermissionSeeder.php` **mirroring `CompanyUnitPermissionSeeder`**: `GROUP = 'Organization Administration'`, `CODES` = the 19 `org.*` codes above, `SENSITIVE` = every write + `org.master.update`, `GRANTS = ['super_administrator' => all, 'security_administrator' => all, 'tenant_administrator' => the five reads]`. Invoke it from a migration `2026_08_14_00000N_seed_organization_permissions.php` (`(new OrganizationPermissionSeeder())->run()`), guarded on `permissions.code` existing.

### Step 3 — Register the module gate
In `app/Http/Middleware/RequireModuleSchema.php`, add to `MODULES`:
```php
'organization' => [
    'legal_entities',
    'locations',
    'user_locations',
    'calendars',
    'calendar_holidays',
],
```
(Enterprise-master routes live on the `companies` table, which is already gated by `module.schema:authorization` — see §5.)

---

## 5. Backend implementation

### Route wiring (`routes/api.php`)

Wrap everything within the existing `jwt.auth` group. Keep literal segments before `{id}` routes (comment this, per house style). Numeric params get `->whereNumber('id')`. Add throttles to create `['throttle:30,1', ...]`.

**Enterprise master** (gated `module.schema:authorization`):
```
GET   v1/admin/organization/enterprise                         org.master.read
PATCH v1/admin/organization/enterprise/{id}                    org.master.update
```

**Legal entities / locations / calendars** (gated `module.schema:organization`):
```
GET    v1/admin/organization/legal-entities                    org.legal_entity.read      (filters: company_id, search, status)
POST   v1/admin/organization/legal-entities                    org.legal_entity.create
PUT    v1/admin/organization/legal-entities/{id}               org.legal_entity.update
PATCH  v1/admin/organization/legal-entities/{id}/status        org.legal_entity.status
DELETE v1/admin/organization/legal-entities/{id}               org.legal_entity.delete

GET    v1/admin/organization/locations                         org.location.read          (filters: company_id, parent_id, kind, search, status)
POST   v1/admin/organization/locations                         org.location.create
PUT    v1/admin/organization/locations/{id}                    org.location.update
PATCH  v1/admin/organization/locations/{id}/status             org.location.status
DELETE v1/admin/organization/locations/{id}                    org.location.delete         (guard: has children)
GET    v1/admin/organization/locations/{id}/members            org.location.read
POST   v1/admin/organization/locations/{id}/members            org.location.update         (assign users: body {userIds: []})
DELETE v1/admin/organization/locations/{id}/members/{userId}   org.location.update

GET    v1/admin/organization/calendars                         org.calendar.read           (filters: company_id, unit_id, search, status)
POST   v1/admin/organization/calendars                         org.calendar.create
PUT    v1/admin/organization/calendars/{id}                    org.calendar.update
PATCH  v1/admin/organization/calendars/{id}/status             org.calendar.status
DELETE v1/admin/organization/calendars/{id}                    org.calendar.delete          (guard: has holidays; block instead of cascade)
GET    v1/admin/organization/calendars/{id}/holidays?year=     org.calendar.read
POST   v1/admin/organization/calendars/{id}/holidays           org.calendar.update         (upsert by date: body {date,title,kind,isHalfDay,recurring})
DELETE v1/admin/organization/calendars/{id}/holidays/{holidayId} org.calendar.delete
```

### Controllers
`app/Http/Controllers/Api/V1/Admin/Organization/` — four controllers: `EnterpriseMasterController`, `LegalEntityController`, `LocationController`, `CalendarController`. Each copies CompanyUnitController's anatomy: constructor with `private readonly` service props; `missing(string $message): JsonResponse` returning 404 `{success:false, error:{code:'NOT_FOUND',...}}`; `guarded(callable $run)` mapping `ProvisioningException` (reuse `App\Services\Provisioning\ProvisioningException`, or a sibling `App\Services\Organization\OrganizationException` with the same shape) to `{success:false, error:{code:$e->errorCode, message:$e->getMessage()}}` at `$e->status`; create → 201; delete → `{success:true, data:{id}}`; list responses `{success:true, data:[...]}`.

Inline validation (`$request->validate([...])`, custom messages, `Rule::unique(...)->ignore($id)` where applicable). Present camelCase payload keys (`isActive`, `parentId`, `companyId`, `countryCode`, `isPrimary`, `isHalfDay`, `workWeek`, `userIds`) → snake_case columns. Never trust arrays blindly: whitelist `userIds` contents with `Rule::exists('users', 'id')` and remove duplicates.

### Services
`app/Services/Organization/` — `EnterpriseMasterService`, `LegalEntityService`, `LocationService`, `CalendarService`. Rules:
- **Tenancy check first** in every read/write that names a company: resolve the claimed company, then verify `CompanyMembership::parse(auth('api')->user()->company_code)` contains that company's `code` (or the caller has global scope). Reject with 403 `FORBIDDEN_COMPANY` otherwise. Super-admin bypass per §2.5.
- Lists are **unpaginated, filterable** (matches the companies/units precedent — full tenant master data). `present*()` mappers return camelCase arrays; `locations()` renders `parentName` (+ recursively-expanded options list for the parent picker) and `memberCount`; enterprise list renders `legalEntityCount`, `locationCount`, `calendarCount`.
- Writes inside `DB::transaction`; guard rules throwing exceptions: `COMPANY_INACTIVE`, `LOCATION_HAS_CHILDREN`, `LEGAL_ENTITY_PRIMARY` (cannot deactivate the `is_primary` entity), `LOCATION_CODE_TAKEN`, `CALENDAR_NAME_TAKEN`, `CALENDAR_HAS_HOLIDAYS` (delete blocked), `HOLIDAY_EXISTS` (upsert hits the unique `(calendar_id, date)`), `MEMBER_NOT_FOUND`, `COMPANY_FORBIDDEN`.
- `AuditLogger::log($request, $changeType, $module, $old, $new)` on every mutation (module `'organization'`); for `user_locations` membership changes also call `AuthorizationCache::invalidate($companyCode)` after commit.

---

## 6. Frontend implementation

### Feature module — API service
`src/features/organization/services/organizationApi.js` — **do not** touch `src/utils/api.js`. Mirror `permissionMatrixApi` exactly:
- `import { apiRequest } from "../../../utils/api";`
- private `headers(accessToken, tokenType = "Bearer")` returning `{ Authorization: \`${tokenType} ${accessToken}\` }`
- token-first method signatures `(…pathAndBodyParams, accessToken, tokenType = "Bearer")`; GET query strings via `URLSearchParams`; bodies `JSON.stringify`.
- Methods: `enterpriseList(filters, token, tt)`, `updateEnterprise(id, payload, token, tt)`, plus `legalEntities`, `createLegalEntity`, `updateLegalEntity`, `setLegalEntityStatus`, `deleteLegalEntity`, `locations`, `createLocation`, `updateLocation`, `setLocationStatus`, `deleteLocation`, `locationMembers`, `assignLocationMembers`, `removeLocationMember`, `calendars`, `createCalendar`, `updateCalendar`, `setCalendarStatus`, `deleteCalendar`, `calendarHolidays(calendarId, year, token, tt)`, `upsertHoliday(calendarId, payload, token, tt)`, `deleteHoliday(calendarId, holidayId, token, tt)`.
- Envelope: return `apiRequest(...)` directly (pages read `res.data`), exactly as `companyUnitApi` does.

### Pages — `src/pages/admin/organization/`
One default-export page per subdomain, built to the **CompanyUnits.jsx template** (read it fully first): local `inputClass`/`labelClass` constants; `const { user } = useAuth(); const token = user?.accessToken; const tokenType = user?.tokenType || "Bearer";`; `const { can } = useAuthorization();`; `useState` + `useEffect` (+ `active` flag) + `Promise.all` + `refreshKey` reload; a `run(work, message)` mutation wrapper (no optimistic updates — mutate, toast, reload); `toast.success/error(err.message)`. Filtering is server-side (change filter → set `loading` → refetch). No `@` alias — relative imports only; all pages are `React.lazy` in App.jsx.

- **`EnterpriseMaster.jsx`** (`/admin/organization/master`) — table/cards of companies with enterprise attributes; read-only view for non-`org.master.update` users with an edit Modal gated on `can("org.master.update")`; show child counts (legal entities / locations / calendars).
- **`LegalEntities.jsx`** (`/admin/organization/legal-entities`) — table (code, name, legal name, country, currency, primary badge, active badge), filters (search/status/companyId), create/edit modal (`companyId` select from companies list, `DatePicker`-free — registration date is text-free; use `DatePicker` only for date columns), status toggle + delete row actions gated by `can(...)`. Company selector must be disabled when the user belongs to exactly one company.
- **`Locations.jsx`** (`/admin/organization/locations`) — table (code, name, kind → `<Badge>`, parent via `parentName`, city, members count), filters (companyId/search/kind/status), create/edit modal with `parentId` select (recursively-expanded options, exclude self/descendants on edit), `kind` select, geo/address fields; row status toggle + delete (disabled with explanatory `title` when `hasChildren`); a members `Drawer` per location (list of assigned users, `CheckboxMultiSelect` or checkboxes to add, remove per row) gated `can("org.location.update")`.
- **`Calendars.jsx`** (`/admin/organization/calendars`) — table (name, unit or "Company default", work-week summary, active badge), create/edit modal (name, companyId/unitId selects, `work_week` day toggles), status toggle + delete; per-calendar holidays managed in a `Drawer`/`Modal` with a year `MonthYearPicker`/year filter, holiday rows (date/title/kind/half-day/recurring) and an "Add holiday" row using `DatePicker`, delete per row.

### Route + nav wiring (four files)
1. **`src/App.jsx`** — add `const EnterpriseMaster = lazy(() => import("./pages/admin/organization/EnterpriseMaster"));` (and siblings) + four routes nested under `/admin`:
   - `organization/master` → `requiredPermission="org.master.read"`
   - `organization/legal-entities` → `requiredPermission="org.legal_entity.read"`
   - `organization/locations` → `requiredPermission="org.location.read"`
   - `organization/calendars` → `requiredPermission="org.calendar.read"`
2. **`src/components/layout/useNavItems.js`** — inside `getAdminNav`, add a section:
   ```js
   ...(rawRole === 0 || hasAccess("org.master.read") || hasAccess("org.legal_entity.read") || hasAccess("org.location.read") || hasAccess("org.calendar.read") ? [{
     label: "Organization", icon: Building2, subItems: [
       { to: "/admin/organization/master", label: "Enterprise Master" },
       { to: "/admin/organization/legal-entities", label: "Legal Entities" },
       { to: "/admin/organization/locations", label: "Locations" },
       { to: "/admin/organization/calendars", label: "Calendars" },
     ],
   }] : []),
   ```
   (import `Building2` from `lucide-react`). `decorateNavigation(nav, routeState)` already drops/annotates per-route state — no extra work.
3. **`src/components/layout/AppLayout.jsx`** — add the four paths to `pageTitles`.
4. No changes needed to `Sidebar.jsx`/`EnterpriseNav.jsx` (both consume `useNavItems()`).

### Tests (colocated, vitest + @testing-library)
Create `LegalEntities.test.jsx`, `Locations.test.jsx`, `Calendars.test.jsx` (EnterpriseMaster optional). Mirror `CompanyUnits.test.jsx` exactly: mock `react-hot-toast`, the feature service module, `AuthContext` (returns a fake user), `useAuthorization` (a mutable `allowed` set). Cover: lists render rows from mocked API data; create flow posts expected camelCase payload; status toggle calls `setXStatus(id, !isActive, token, tokenType)`; delete disabled when dependency flags set; permission gating hides Add/actions when `allowed` lacks the write code. Run with `npm run test:frontend`.

---

## 7. Definition of done & verification

Run all of these before declaring done:

**Backend (`salary-slip-bac/`):**
1. `php artisan migrate` — all six migrations land, idempotent on rerun.
2. `php artisan authz:sync-catalog --dry-run` (or `--check`) — no drift; the new `org.*` codes are recognised.
3. Migration-seeded permissions present: rerun-safe (`updateOrInsert`), `super_administrator` + `security_administrator` get all, `tenant_administrator` the five reads.
4. `php artisan route:list --path=v1/admin/organization` — every route shows its `permission:` middleware; literal-vs-`{id}` ordering is correct; `whereNumber` on `{id}`.
5. Manual/smoke test a tenant-scoped user: claiming another company's `company_id` → 403 `FORBIDDEN_COMPANY`; mutating without the code → 403 `PERMISSION_DENIED`; pre-migration absence → 503 `MODULE_SCHEMA_NOT_READY`.
6. `php artisan test` — existing suite stays green.

**Frontend (`salary-slip-front/salary-slip-front/`):**
1. `npm run lint` — clean.
2. `npm run test:frontend` — new + existing tests green.
3. `npm run build` — production build succeeds.
4. Visual smoke: sidebar shows "Organization" section only for users holding any `org.*.read`; each page gates actions per `can(...)` in light + dark mode.

---

## 8. Phase 2 sketches (do NOT build now — keep backwards-compatible)

- **02.05 Financial Organizational Structure** — `cost_centers` (id, company_id, code, name, parent_id nullable, legal_entity_id nullable FK, is_active, unique(company_id, code)); future payroll writes reference `cost_center_id` on payslips.
- **02.06 Organizational Hierarchy** — `org_units` (id, company_id, code, name, parent_id self-FK, head_user_id nullable FK users, is_active, unique(company_id, code)) holding the divisional tree distinct from `locations`. Permissions `org.hierarchy.*`.
- **02.07 Reporting Structure** — extend the existing `reporting_relationships` (already effective-dated, partial-unique `one_active_primary`) rather than a new table; new endpoints under an `org.*` namespace instead of the current `support.ticket.*` gate; add org-chart traversal.
- **02.08 Organizational Chart** — read-only tree endpoint (`GET organization/chart?company_id=`) rendered from org_units + reporting lines; no writes.
- **02.09 Change Management** — `org_change_proposals` (effective-dated, status `draft|pending|approved|reverted`, diff payload, created_by, reviewed_by); applying a proposal writes the org_units/locations it references and audits the same `AuditLogger`.

Phase 2 must follow every constraint in §2 and re-use the §4 permission/registry/seeder pipeline (`org.hierarchy.*`, `org.chart.*`, `org.change.*`).

---

## 9. Anti-goals recap (so the agent doesn't regress the platform)

- **Do not** add the new API surface to `src/utils/api.js`; use the feature service.
- **Do not** edit `AuthContext`, `useAuthorization`, `ProtectedRoute`, `CompanyContext`, or the authorization engine; only *use* them.
- **Do not** create a `legal_entities` column on `users` or touch `users.company_code`/`users.unit`.
- **Do not** reintroduce the dropped `branches`/`teams`/`approval_levels` tables or reuse their names.
- **Do not** change `companies`/`units` behavior in Access Control; `org.master.update` only writes the *new* enterprise columns.
- **Do not** delete a company, primary legal entity, calendar with holidays, or a parent location; always guard and return 422.
- **Do not** leave a permission code in a route without it being in both `PermissionRegistry::NODES` and the seeder.