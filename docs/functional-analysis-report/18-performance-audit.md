# 19. Performance Audit

## 19.1 Backend

### No background job processing — the single biggest structural performance risk
- `QUEUE_CONNECTION=database` is configured and the stock `jobs`/`job_batches`/`failed_jobs` tables exist, but **no `app/Jobs` classes exist and nothing in the codebase ever dispatches a queued job**.
- All 4 Mailables (`PortalOtpMail`, `InterviewScheduledMail`, `OfferMail`, `AssessmentInviteMail`) send **synchronously, in-request** — e.g., releasing an offer blocks the HTTP response on the mail server round-trip. Under a slow or unreachable mail provider, this directly degrades the offer-release, interview-scheduling, and OTP-request user experience.
- Bulk imports (employee, salary, attendance, account-master) run **synchronously**; `UserController@import` explicitly raises `set_time_limit(180)` — a tell that these imports are expected to sometimes take multiple minutes, held open as a single HTTP request rather than processed in the background with progress polling.
- **Recommendation:** introduce real queued jobs (the infrastructure — `jobs` table, `database` queue driver — is already provisioned but unused) for mail sends and large bulk imports, with a worker process. This is a substantial but high-value change.

### No scheduler
- No `->withSchedule()` and no `Schedule::` calls anywhere. All 9 operational Artisan commands (`documents:reconcile`, `documents:migrate-s3`, `aadhaar:audit`, `authz:coverage`, etc.) must be triggered manually or via an external cron that this repository doesn't itself set up. If `documents:reconcile` (which detects stale/orphaned upload rows) is meant to run periodically in production, **there is currently no evidence it does**, meaning drift between the DB and S3 could accumulate silently between manual runs.

### N+1 / query-cost risks
- `AuthorizationEngine::decide()` runs per-permission and includes a memoized schema probe (`SchemaSupport`) specifically because "a raw information_schema round trip per call would be expensive" — the code itself acknowledges this cost center and mitigates it with memoization, a good sign, but a `me()`-style bulk permission sweep across many permission codes is still inherently more expensive than a single joined query would be.
- Company/unit tenancy scoping is reimplemented independently in multiple places (`ScopeMatcher`, `AuthorizedUserQuery`, `Ticket::scopeVisibleTo`, several controllers) rather than centralized — beyond the maintainability cost (see [Bug & Issue Report](19-bugs-issues.md)), any one of these independent implementations could silently regress to an unscoped or inefficient query without the others being fixed in tandem.
- A dedicated migration (`add_user_query_performance_indexes`) retroactively added 5 composite indexes to `users` — evidence that query performance on the users table was a real, previously-unaddressed problem, now partially mitigated.

### File/document operations
- S3 multipart upload thresholds are configurable and orphaned-part cleanup exists on failure — a reasonably mature implementation.
- `documents:reconcile-folders` explicitly notes "S3 has no atomic move," so folder-key corrections are a two-step copy-then-delete process — inherently more failure-prone / slower than a rename, an unavoidable cost of the storage choice rather than a code defect.

## 19.2 Frontend

### Bundle size
- A deliberate lazy-loading pass (every page except `Login`/`AppLayout` wrapped in `React.lazy`) was already done specifically to shrink an initial bundle from ~2.5MB — a concrete, documented performance fix already applied.
- `utils/api.js` at 1,933 lines is a single monolithic module bundled with nearly every page (since almost every page calls some API) — not lazy-loadable by nature of being a shared dependency; not necessarily a problem, but worth knowing it's part of every route's baseline bundle.

### Heavy grid components
- `AgGridReact` powers the largest/most complex pages: Appointments.jsx (2,428 lines), EmployeeManagement.jsx (1,570 lines), TrialForm.jsx (1,411 lines), SalaryManagement.jsx (1,057 lines). AG Grid itself is performant for large datasets, but the surrounding page components being this large suggests significant logic co-located with rendering — a maintainability concern more than a runtime-performance one, though it does increase the per-route JS parse/compile cost for these specific screens even with code-splitting.

### PDF/print generation is entirely client-side
- No server-side PDF rendering exists; `exportNodeToPdf`/`downloadForm16PDF`/`downloadTablePDF` all render from live DOM nodes in the browser. For large documents (e.g., Form 16's multi-page Part A/B tables) or on lower-powered devices (relevant given the Capacitor mobile/Android target), this shifts real CPU cost onto the end-user device rather than the server — a deliberate architecture choice (avoids a server PDF-rendering dependency) with a real device-performance tradeoff, especially on the mobile app.

### Real-time transport
- `socket.js`'s hardcoded LAN IP fallback (`http://192.168.1.53:8000`) would cause the Socket.IO client to attempt a connection to an unreachable/wrong address in any environment where `VITE_SOCKET_URL` isn't set — likely manifesting as repeated failed-connection retries rather than a clean disabled state, a minor but real background-resource waste. See [Bug & Issue Report](19-bugs-issues.md).

### LocalStorage/sessionStorage growth
- Several features persist non-trivial state to `localStorage` (notifications under versioned keys, HR Settings if confirmed localStorage-backed, company scope, saved Hiring filter views per-tab). None of this was found to have an eviction/expiry strategy — over a long-lived browser profile this is unlikely to cause a real problem given typical `localStorage` quotas, but is worth a light periodic review if more large-payload features are added to this pattern.

## 19.3 Database

- PostgreSQL only, enforced — a reasonable, scalable choice for this workload.
- No `companies`/`units` foreign-key model means every tenancy-scoped query filters on string columns (`company_code`, `unit`) rather than an indexed integer foreign key — the retrofit composite indexes on `users` (`[company_code,unit]`, `[role,company_code]`, etc.) mitigate this for the `users` table specifically, but `salary_slips`, `attendances`, and other tenancy-scoped tables were not confirmed to have equivalent composite indexes in this pass — worth a direct `EXPLAIN` audit under real data volume if payroll/attendance queries are ever reported as slow.

## 19.4 Summary of top opportunities

1. **Move mail sends and bulk imports to a real queue** — infrastructure already exists, unused. (High impact, medium effort)
2. **Add a scheduler for the maintenance Artisan commands** that read as though they're meant to run periodically (`documents:reconcile` especially). (Medium impact, low effort)
3. **Confirm/add composite indexes on `salary_slips` and `attendances`** matching the pattern already applied to `users`. (Medium impact, low effort)
4. **Fix the hardcoded Socket.IO fallback address** to fail cleanly instead of retry-looping against a fixed LAN IP. (Low impact, low effort)
5. **Centralize tenancy-scoping logic** fully into `ScopeMatcher` (already partially done) to remove the remaining independent reimplementations, reducing both correctness and performance-drift risk. (Medium impact, medium effort)
