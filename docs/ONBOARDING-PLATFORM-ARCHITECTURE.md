# Enterprise Onboarding & New Hire Experience Platform — Architecture

**4 August 2026** · target: 100,000+ employees, multi-company, multi-country, multi-language

Companion to `STABILIZATION-2026-08-03.md`. Read §1 before planning any sprint.

---

## 1. Ground truth — what exists today

The brief says "upgrade the existing Onboarding module" and "do not remove any
existing functionality." Measured, not assumed, the existing module is:

| Surface | Reality |
|---|---|
| `EmployeeOnboarding.jsx` | **123 lines**. One call: `hrApi.getOffers({status:'accepted'})`. Renders a list. |
| `/api/hr/offers/*` | 8 routes on `OfferController`, gated by `module.schema:hr` |
| `offers` table | **does not exist** in production |
| Runtime behaviour | the gate returns **503**; the page shows an empty state |

Wider HR context, counted rather than recalled: **71 HR routes** registered
across 12 HR UI pages, all against the 13 absent tables.

**There is no functioning onboarding module to preserve.** Backward
compatibility therefore costs nothing here — one page and one endpoint. That is
good news for design freedom and bad news for any plan that assumed a base to
build on.

### The blocker, stated once

```
ghost ledger rows (0003, 0004)  ->  php artisan migrate refuses
                                ->  13 HR tables never land
                                ->  71 HR routes 503
                                ->  onboarding cannot store a single row
```

Every table in this document is undeployable until
`docs/repair/fix-authz-migration-ledger.sql` runs. That script is written and
rehearsal-verified; it has not been executed. **Phase 0 is not optional and
nothing in Phases 1–9 can ship before it.**

Adding forty more migration files to a stack of fourteen that already cannot
apply would deepen the hole, so the DDL below is delivered as reviewable schema
rather than as migrations. Converting it is an hour's work once the ledger is
repaired — and it should not happen before.

---

## 2. What must be reused, not rebuilt

The brief's submodule list overlaps heavily with subsystems that already exist
and are populated. Rebuilding them would fork the data.

| Brief asks for | Already exists | Decision |
|---|---|---|
| Document Collection (Aadhaar, PAN, …) | `documents`, `document_versions`, `document_audit_logs` — 38 live rows, checksums, S3 keys, KMS fields | **Extend.** Add `onboarding_document_requirements` that *references* `documents.id`. Never a second document store. |
| Aadhaar capture | `aadhaar_secure_reference`, `aadhaar_last_four`, `encrypted_aadhaar_number`, `aadhaar_export_authorizations` (migrated 30 July, unpopulated) | **Use them.** See §6 — this is the single most important constraint in this document. |
| Audit Log | `audit_logs`, `document_audit_logs` | **Extend** via observers. Do not create `onboarding_audit_logs`. |
| Org Assignment | `company_units`, `organization_structure_tables`, `branch_location_tables` | Reference by FK. |
| Account Provisioning / RBAC | `roles`, `permissions`, `user_roles` | See §7 — this is blocked on a real problem. |
| Compensation Setup | `salary_slips`, payroll setup tables | Reference, never duplicate. |
| IT Assets | `assets`, `asset_allocations` (pending migrations) | Already designed; do not redesign. |

**Net new tables: 27**, not the ~60 a literal reading of the twenty submodules
would produce.

---

## 3. Data model

### 3.1 Conventions for 100k+

Every table carries:

```sql
tenant_id      VARCHAR(64)  NOT NULL   -- company_code; the tenancy boundary
legal_entity_id BIGINT                 -- multi-country: the employing entity
country_code   CHAR(2)                 -- drives compliance rules
created_at, updated_at, created_by, updated_by
```

- **Tenancy is a column, not a database.** 100k employees across N companies in
  one schema, with `tenant_id` leading every composite index. Postgres RLS is
  available as defence in depth but must not be the only enforcement — the
  application already has a scope matcher.
- **UUID surrogate + bigint PK.** Bigint identity for joins and index size;
  a `public_id UUID` for anything a URL or a partner system sees. Sequential
  ids in URLs leak headcount and growth rate.
- **Partitioning** on the three tables that grow without bound (§3.6).
- **No `SELECT *` across journeys.** The wide read is the timeline, and it is
  served from a projection (§5.3).

### 3.2 Core spine

```sql
-- One row per person being onboarded. The aggregate root.
CREATE TABLE onboarding_journeys (
  id                  BIGSERIAL PRIMARY KEY,
  public_id           UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id           VARCHAR(64)  NOT NULL,
  legal_entity_id     BIGINT,
  country_code        CHAR(2)      NOT NULL DEFAULT 'IN',
  locale              VARCHAR(10)  NOT NULL DEFAULT 'en-IN',

  -- Exactly one of these is set. A journey starts as a candidate and becomes
  -- an employee at joining; keeping both lets pre-boarding exist before a
  -- users row does, which is the whole point of pre-boarding.
  candidate_id        BIGINT REFERENCES candidates(id),
  user_id             BIGINT REFERENCES users(id),
  offer_id            BIGINT REFERENCES offers(id),

  template_id         BIGINT NOT NULL REFERENCES onboarding_templates(id),
  status              VARCHAR(32) NOT NULL DEFAULT 'PRE_BOARDING',
    -- PRE_BOARDING | JOINING | IN_PROGRESS | PROBATION | COMPLETED
    -- | WITHDRAWN | NO_SHOW | TERMINATED
  joining_date        DATE,
  actual_joining_date DATE,
  joining_mode        VARCHAR(16),   -- OFFICE | REMOTE | HYBRID | VIRTUAL
  work_location_id    BIGINT,

  reporting_manager_id BIGINT REFERENCES users(id),
  buddy_id             BIGINT REFERENCES users(id),
  mentor_id            BIGINT REFERENCES users(id),

  -- Denormalised for the dashboard. Maintained by trigger (§5.3); never the
  -- source of truth, always rebuildable from onboarding_tasks.
  progress_pct        SMALLINT NOT NULL DEFAULT 0,
  tasks_total         INTEGER  NOT NULL DEFAULT 0,
  tasks_done          INTEGER  NOT NULL DEFAULT 0,
  sla_breached        BOOLEAN  NOT NULL DEFAULT FALSE,
  risk_score          SMALLINT,      -- §9, nullable: AI is advisory

  probation_days      SMALLINT,
  probation_ends_on   DATE,
  confirmed_at        TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT, updated_by BIGINT,

  CONSTRAINT onboarding_journeys_subject_present
    CHECK (candidate_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX ON onboarding_journeys (public_id);
-- The dashboard's primary query: this tenant, joining soon, not finished.
CREATE INDEX ON onboarding_journeys (tenant_id, status, joining_date)
  WHERE status NOT IN ('COMPLETED','WITHDRAWN','NO_SHOW','TERMINATED');
CREATE INDEX ON onboarding_journeys (tenant_id, reporting_manager_id, status);
CREATE INDEX ON onboarding_journeys (tenant_id, joining_date)
  WHERE sla_breached;
```

### 3.3 Templates — why onboarding is configuration, not code

100k employees across countries means the checklist for a Bangalore engineer
and a Dubai site supervisor differ in tasks, documents, policies and statutory
enrolments. Hard-coding any of that guarantees a rewrite per country.

```sql
CREATE TABLE onboarding_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  code            VARCHAR(64) NOT NULL,
  name            VARCHAR(190) NOT NULL,
  country_code    CHAR(2),
  legal_entity_id BIGINT,
  department_id   BIGINT,
  grade           VARCHAR(32),
  employment_type VARCHAR(32),        -- FULL_TIME | CONTRACT | INTERN
  version         INTEGER NOT NULL DEFAULT 1,
  status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',  -- DRAFT|PUBLISHED|ARCHIVED
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, version)
);

-- Task definitions. A journey instantiates these into onboarding_tasks.
CREATE TABLE onboarding_template_tasks (
  id BIGSERIAL PRIMARY KEY,
  template_id   BIGINT NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  code          VARCHAR(64) NOT NULL,
  category      VARCHAR(32) NOT NULL,
    -- PRE_BOARDING | DOCUMENT | POLICY | TRAINING | ASSET | ACCOUNT
    -- | WORKSPACE | COMPENSATION | BGV | ENGAGEMENT | PROBATION
  owner_role    VARCHAR(32) NOT NULL,   -- HR|MANAGER|IT|ADMIN|FINANCE|SECURITY|EMPLOYEE
  title_i18n_key VARCHAR(128) NOT NULL, -- §8: never store display text here
  is_mandatory  BOOLEAN NOT NULL DEFAULT TRUE,
  blocks_joining BOOLEAN NOT NULL DEFAULT FALSE,
  due_offset_days SMALLINT NOT NULL DEFAULT 0,  -- relative to joining_date, may be negative
  sla_hours     INTEGER,
  depends_on_code VARCHAR(64),          -- simple DAG within a template
  auto_complete_rule JSONB,             -- e.g. {"on":"document_approved","doc":"PAN"}
  payload       JSONB,                  -- category-specific config
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (template_id, code)
);
```

Template resolution at journey creation, most specific wins:

```
legal_entity + department + grade + employment_type
  -> legal_entity + department
  -> legal_entity
  -> country
  -> tenant default
```

### 3.4 Tasks — the workhorse, and the one to get right

```sql
CREATE TABLE onboarding_tasks (
  id BIGSERIAL,
  tenant_id     VARCHAR(64) NOT NULL,
  journey_id    BIGINT NOT NULL,
  template_task_id BIGINT,
  code          VARCHAR(64) NOT NULL,
  category      VARCHAR(32) NOT NULL,
  owner_role    VARCHAR(32) NOT NULL,
  assigned_to   BIGINT REFERENCES users(id),
  status        VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    -- PENDING|IN_PROGRESS|BLOCKED|SUBMITTED|APPROVED|REJECTED|COMPLETED|SKIPPED|WAIVED
  is_mandatory  BOOLEAN NOT NULL DEFAULT TRUE,
  blocks_joining BOOLEAN NOT NULL DEFAULT FALSE,
  due_at        TIMESTAMPTZ,
  sla_due_at    TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,
  escalation_level SMALLINT NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  completed_by  BIGINT,
  -- Category-specific linkage. Nullable by design: a DOCUMENT task points at
  -- documents.id, an ASSET task at asset_allocations.id. One nullable FK per
  -- category beats a polymorphic (type, id) pair that no FK can protect.
  document_id       BIGINT REFERENCES documents(id),
  asset_allocation_id BIGINT,
  policy_acceptance_id BIGINT,
  training_enrollment_id BIGINT,
  provisioning_request_id BIGINT,
  payload       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, tenant_id)
) PARTITION BY HASH (tenant_id);
```

At 100k employees × ~45 tasks each, this table is **4.5M rows and growing**.
Hash partitioning on `tenant_id` (16 partitions) keeps each partition's index
in cache and makes the overwhelmingly common tenant-scoped query touch one
partition.

```sql
-- The four queries that matter, in order of frequency.
CREATE INDEX ON onboarding_tasks (tenant_id, journey_id, sort_order);         -- journey view
CREATE INDEX ON onboarding_tasks (tenant_id, assigned_to, status, due_at)
  WHERE status IN ('PENDING','IN_PROGRESS','BLOCKED');                        -- my worklist
CREATE INDEX ON onboarding_tasks (tenant_id, sla_due_at)
  WHERE sla_breached_at IS NULL AND status NOT IN ('COMPLETED','SKIPPED','WAIVED');
                                                                              -- SLA scanner
CREATE INDEX ON onboarding_tasks (tenant_id, category, status);               -- dashboard rollups
```

The SLA index is partial on purpose. A full index over 4.5M rows to find the
few thousand approaching breach is the difference between a scan that runs in
milliseconds every minute and one that does not.

### 3.5 Remaining tables (summary)

| Table | Purpose | Notes |
|---|---|---|
| `onboarding_document_requirements` | which docs this journey owes | FK to `documents.id`; OCR + validation status |
| `onboarding_policy_documents` | policy master, versioned | version history is a requirement, not a nicety |
| `onboarding_policy_acceptances` | who accepted which version | e-signature hash, IP, UA, timestamp — immutable |
| `onboarding_training_programs` / `_modules` / `_enrollments` / `_assessments` | learning | enrollment is per journey |
| `onboarding_provisioning_requests` | AD / Entra / Workspace / M365 / VPN / SSO | outbox pattern, §5.2 |
| `onboarding_bgv_checks` | 6 check types + vendor ref | vendor payloads in JSONB |
| `onboarding_workspace_allocations` | desk, locker, parking, access | |
| `onboarding_probation_reviews` | monthly reviews, confirmation | |
| `onboarding_buddy_assignments` | buddy/mentor with acceptance | |
| `onboarding_notifications` | email/SMS/push/WhatsApp/in-app | dispatch log, not a queue |
| `onboarding_events` | append-only domain event log | partitioned by month |
| `onboarding_task_comments` | collaboration | |
| `onboarding_i18n_strings` | translations | §8 |
| `onboarding_checklist_signoffs` | HR/IT/Manager/Finance sign-off | |

### 3.6 Partitioned tables

| Table | Strategy | Reason |
|---|---|---|
| `onboarding_tasks` | HASH (tenant_id), 16 | 4.5M+ rows, always tenant-scoped |
| `onboarding_events` | RANGE (occurred_at), monthly | append-only, queried by recency, dropped by age |
| `onboarding_notifications` | RANGE (created_at), monthly | high volume, short retention |

---

## 4. Scale — what 100,000 employees actually costs

Sizing from the schema, not from optimism. Assume 100k active employees, 25%
annual churn → **25,000 journeys/year**, and a bulk-hire peak of 5,000 in a day
(campus intake is the real stress case, not steady state).

| Quantity | Steady | Peak day |
|---|---|---|
| Journeys created | ~100/day | 5,000 |
| Tasks instantiated | ~4,500/day | **225,000** |
| Notifications | ~9,000/day | 450,000 |
| Documents uploaded | ~800/day | 40,000 |
| Provisioning calls | ~600/day | 30,000 |

Consequences that shape the design:

1. **Journey creation must be a job, never a request.** Instantiating 45 tasks,
   resolving a template, seeding documents and firing notifications inside an
   HTTP request is a 3–8 second call. At 5,000 in a morning it is an outage.
   `POST /journeys` writes the journey row and enqueues `InstantiateJourney`.
2. **Bulk intake is a batch entity**, not a loop over the single-create API.
   `onboarding_batches` with chunked processing, resumable, idempotent per row.
3. **Provisioning is the slowest and least reliable dependency.** AD, Entra and
   Workspace are third-party, rate-limited and occasionally down. They get the
   outbox pattern (§5.2) — never a synchronous call inside a transaction.
4. **The dashboard must not aggregate 4.5M rows on request.** Counters on
   `onboarding_journeys` maintained by trigger, plus a nightly materialised
   view for the analytics tiles. Correctness is guaranteed by a reconciliation
   job, not by hoping the trigger never misses.
5. **Redis** for: template resolution (changes rarely, read constantly), i18n
   bundles, dashboard tiles (60s TTL), and idempotency keys.

---

## 5. Workflow engine

### 5.1 Task state machine

```
PENDING ─> IN_PROGRESS ─> SUBMITTED ─> APPROVED ─> COMPLETED
   │            │             │           │
   │            │             └─> REJECTED ─┘ (back to IN_PROGRESS)
   ├─> BLOCKED (dependency unmet) ─> PENDING
   └─> SKIPPED | WAIVED  (requires reason + permission)
```

`WAIVED` is deliberately distinct from `SKIPPED`. Skipping is "not applicable
to this hire"; waiving is "mandatory, consciously overridden by someone with
authority" — and it must be permissioned, reasoned and audited. Onboarding
audits fail on exactly this distinction.

### 5.2 Provisioning — the outbox pattern, and why

Account provisioning writes to systems this database cannot roll back. A
transaction that creates an AD account and then fails leaves an orphan account
with access.

```
BEGIN;
  UPDATE onboarding_tasks SET status='IN_PROGRESS' ...;
  INSERT INTO onboarding_provisioning_requests (..., state='QUEUED', idempotency_key=...);
COMMIT;
-- a worker picks it up, calls the external API, records the outcome
```

Every request carries an idempotency key so a retry after a timeout cannot
create a second mailbox. `state`: `QUEUED → SENDING → SUCCEEDED | FAILED |
NEEDS_MANUAL`. Nothing retries forever; after N attempts it becomes an HR task.

### 5.3 Progress projection

`progress_pct` on the journey is a cache. Trigger on `onboarding_tasks`
recomputes it on status change, scoped to mandatory tasks. A nightly job
recomputes every in-flight journey from scratch and logs discrepancies — the
trigger is an optimisation, the recompute is the truth.

### 5.4 SLA and escalation

One scheduled scan per minute over the partial index in §3.4. Breach sets
`sla_breached_at`, increments `escalation_level`, emits an event, notifies per
the escalation matrix. Escalation levels are configured per template, not
hard-coded.

---

## 6. Security — the constraint that overrides the feature list

**The Document Collection submodule, built literally, recreates the exact
breach found on 3 August.** That finding, verified against production:

- 334 users hold plaintext Aadhaar in `users.aadhar_card_no`
- 37 of 38 S3 object keys have a 12-digit first path segment; 14 equal a real
  user's Aadhaar number
- 2,417 logged full-Aadhaar disclosures, the top two from **list** endpoints

Non-negotiable rules for this module:

1. **Aadhaar is never a column value in a new table.** Journeys reference
   `users.aadhaar_secure_reference`. The columns already exist (migrated 30
   July, still unpopulated) — populate them via
   `docs/repair/aadhaar-remediation.sql` before storing one onboarding record.
2. **Object keys use `aadhaar_secure_reference`, never the number.** S3 keys
   appear in access logs, CloudTrail, CDN logs and every presigned URL.
3. **List endpoints never return full identity numbers.** Only
   `aadhaar_last_four`. Full reveal is a separate, permissioned, audited,
   single-record action — the `aadhaar_export_authorizations` table already
   models this.
4. **No document is downloadable until `scan_status = 'CLEAN'`.** Today all 38
   are `NOT_SCANNED` and there is no quarantine column. Onboarding will
   multiply upload volume by roughly 40× — 40,000 unscanned files on a peak
   intake day. The scanning pipeline is a prerequisite, not a Phase 9 nicety.
5. **E-signatures are immutable.** `onboarding_policy_acceptances` is
   append-only: no UPDATE, no DELETE, enforced by grant. An acceptance record
   that can be edited is not evidence.
6. **Audit via observers**, extending `audit_logs`. Business operations are
   currently unaudited — `AuditLogger` fires only from RBAC/settings screens.
   Onboarding must not inherit that gap.

---

## 7. RBAC — blocked, and honestly so

The brief asks for RBAC + ABAC. The measured state:

```
permission coverage : 0%   (88 enforced codes, 96 catalogued, zero overlap)
RBAC user wiring    : 0.29% (1 of 339 users has a role row)
effective control   : the users.role integer
```

Onboarding needs roughly 60 new permission codes across HR, Manager, IT, Admin,
Finance and Security owners. **Adding 60 codes to a catalogue that already
matches nothing makes the gap worse**, and enabling enforcement below 100%
coverage denies every request — which the legacy fallback then rescues with
`'admin' => true`, an unconditional allow.

Proposed vocabulary, to be seeded **with** the reconciliation, not before:

```
hr.onboarding.journey.{read,create,update,delete,cancel}
hr.onboarding.task.{read,assign,complete,approve,reject,skip,waive}
hr.onboarding.document.{read,request,approve,reject,reveal_identity}
hr.onboarding.policy.{read,publish,accept,report}
hr.onboarding.training.{read,assign,grade}
hr.onboarding.asset.{read,allocate,acknowledge}
hr.onboarding.account.{read,provision,revoke}
hr.onboarding.bgv.{read,initiate,review,override}
hr.onboarding.probation.{read,review,confirm,extend}
hr.onboarding.template.{read,create,publish}
hr.onboarding.batch.{read,create,execute}
hr.onboarding.analytics.{read,export}
```

`reveal_identity`, `waive` and `bgv.override` are the three that matter in an
audit. They must be separately grantable and separately logged.

ABAC scoping reuses the existing `ScopeMatcher`: a manager sees journeys where
`reporting_manager_id = self`; HR sees their `tenant_id`; an IT owner sees only
`category = 'ACCOUNT'` tasks.

---

## 8. Multi-country, multi-language

- **No display text in data tables.** `title_i18n_key` resolves against
  `onboarding_i18n_strings (locale, key, value)` with fallback
  `en-IN → en → key`. Storing English in the template table means a second
  country needs a schema change.
- **Locale on the journey**, not the tenant — a Dubai entity may onboard in
  `en-AE` and `ar-AE` simultaneously.
- **Country drives compliance tasks.** PF/ESI/UAN are Indian; a UAE journey
  gets WPS and Emirates ID instead. This is template data, not `if (country ===
  'IN')` in a controller.
- **Timezones**: `TIMESTAMPTZ` everywhere; `joining_date` stays `DATE` because
  a joining date is a local calendar fact, not an instant.
- **RTL** support in the portal for `ar-*`.

---

## 9. AI — scoped to advisory

Every AI feature in the brief is implementable, and every one of them must be
**advisory, never authoritative**:

| Feature | Boundary |
|---|---|
| Document OCR | extracts, pre-fills, flags mismatches. A human approves. |
| Identity verification | produces a confidence score. Never auto-approves. |
| Risk detection | writes `risk_score`, opens a review task. Never rejects a hire. |
| Checklist automation | proposes template tasks. HR publishes. |
| Training recommendation | ranks optional modules. Never mandatory ones. |
| HR chatbot / FAQ | retrieval over published policy documents only. |
| Progress monitoring | forecasts breach, escalates early. |

Two hard rules. **No PII in prompts** — OCR runs on the document, never with
Aadhaar or bank details in context, and no identity number is sent to a
third-party model. **Every AI action is logged with its model, version and
confidence**, because "the system decided" is not an answer to an auditor.

---

## 10. API surface

REST under `/api/v1/hr/onboarding`, gated by `module.schema:hr`. Cursor
pagination throughout — `OFFSET 50000` on a 4.5M-row table is a scan.

```
Journeys      GET  /journeys                    (cursor, filters)
              POST /journeys                    -> 202 + job id
              GET  /journeys/{publicId}
              GET  /journeys/{publicId}/timeline
              POST /journeys/{publicId}/{cancel|confirm-joining}
Tasks         GET  /tasks?assignedTo=me&status=pending
              POST /tasks/{id}/{start|submit|approve|reject|skip|waive}
              POST /tasks/bulk-approve
Documents     GET  /journeys/{id}/documents
              POST /journeys/{id}/documents/{code}/upload   (reuses document service)
              POST /documents/{id}/{approve|reject}
Policies      GET  /journeys/{id}/policies
              POST /policies/{id}/accept        (e-signature)
Training      GET  /journeys/{id}/training
              POST /training/{enrollmentId}/{start|complete}
Assets        GET  /journeys/{id}/assets
              POST /assets/{allocationId}/acknowledge
Provisioning  POST /journeys/{id}/provision
              GET  /provisioning/{id}
BGV           POST /journeys/{id}/bgv    GET /bgv/{id}
Probation     GET  /journeys/{id}/probation
              POST /probation/{id}/{review|confirm|extend}
Batches       POST /batches   GET /batches/{id}
Templates     GET|POST /templates   POST /templates/{id}/publish
Analytics     GET  /analytics/{dashboard|sla|funnel}
Reports       POST /reports/{type}              -> 202, async, signed URL
Portal        GET  /portal/me                   (the new hire's own view)
```

`POST /journeys` and every report return **202 with a job id**. Anything that
touches 45 tasks or exports 25,000 rows is asynchronous or it is a timeout.

---

## 11. Delivery plan — honest sizing

This is a **6–9 month program for a team**, not a sprint. Sequenced so each
phase ships something usable and nothing is built on an unrepaired foundation.

| Phase | Scope | Gate to proceed |
|---|---|---|
| **0. Unblock** | ledger repair; 14 migrations apply; HR tables land; Aadhaar backfill + encryption; upload scanning + quarantine | `prod-verify.ts` 0 CRITICAL |
| **1. Spine** | journeys, templates, tasks, state machine, instantiation job, timeline UI | a journey can be created and worked |
| **2. Documents & Policies** | requirements on existing document store, approval workflow, versioned policies, e-signature | §6 rules enforced |
| **3. Checklists & SLA** | role checklists, SLA scanner, escalation, notifications | SLA dashboard truthful |
| **4. Pre-boarding & Portal** | candidate portal, welcome portal, mobile responsive | external users can act pre-joining |
| **5. Provisioning** | outbox, AD/Entra/Workspace/M365/VPN/SSO, idempotency | zero duplicate accounts under retry |
| **6. Training, Assets, Workspace** | learning paths, assessments, allocation, acknowledgement | |
| **7. BGV & Probation** | vendor integration, 6 check types, reviews, confirmation | |
| **8. Analytics & Reports** | dashboards, funnel, drop-off, async exports | |
| **9. AI** | OCR, risk, recommendations, chatbot — advisory only | §9 boundaries enforced |

**RBAC (§7) runs parallel to Phases 1–3 and must complete before Phase 4**,
because the candidate portal is the first surface exposed to a non-employee and
it cannot ship on a 0%-coverage catalogue.

### What I have not done, and why

- **No migration files written.** Fourteen already cannot apply; adding twenty-
  seven more would deepen a blockage rather than deliver a feature. The DDL
  above converts in about an hour once Phase 0 is done.
- **No controllers, models or React pages.** Building against tables that do
  not exist reproduces exactly the failure already in production: **71 HR
  routes and 12 HR UI pages** deployed against absent tables, failing at
  runtime rather than at build. Adding to that pile is not progress.
- **No AI implementation.** It is Phase 9 for a reason — it needs the document
  pipeline, the scanner and the audit trail underneath it.

The single most valuable next action is not in this document. It is running
`docs/repair/fix-authz-migration-ledger.sql`, which is written, rehearsal-
verified, guarded, and takes under a second.
