# 21. Improvement Recommendations

> Organized by effort tier rather than strictly per-module, since several of the highest-value fixes are cross-cutting. Module-specific recommendations that emerged from the batched page-level research are captured in each module's own doc under `docs/03-modules/**`.

## 21.1 Quick Wins (low effort, real value)

| Recommendation | Why |
|---|---|
| Fix the header `pageTitles` map to cover every current route | Currently several pages incorrectly show "Dashboard" as their title (see [Bug & Issue Report](19-bugs-issues.md)) |
| Add a sidebar link for `/admin/admins` (or confirm it's intentionally hidden and document why) | Currently invisible/undiscoverable to any admin who doesn't already know the URL |
| Fix the Socket.IO hardcoded LAN fallback address | Prevents pointless connection-retry loops in any environment without `VITE_SOCKET_URL` set |
| Add `"authorization"` to `RequireModuleSchema::MODULES` | Closes the current no-op gate on `v1/admin/users`'s module-readiness check |
| Change the two GET-based delete endpoints (`employee/delete/{id}`, `admin/salary-slip/delete`) to `DELETE` | Removes a real (if narrow) accidental-deletion risk from link prefetching/crawling |
| Label simulated features (Ticket export, Ticket SLA save, Admin Reports) with a visible "Preview/Demo" banner, matching the pattern already used in the Onboarding module | Prevents users from believing an action succeeded when nothing was persisted |
| Fix `OfferController@destroy`'s permission to a dedicated delete permission | Consistency with every other module's delete-permission pattern |
| Wire up an Attendance-marking route in the frontend (`AttendanceUpload.jsx` or `DailyAttendance.jsx`) | The backend endpoints already work; currently there is no way to mark attendance through the live UI at all |
| Fix the undefined `Lock` icon import in `CandidatePipeline.jsx` | Currently throws a real `ReferenceError` the first time the compact view needs to show a locked candidate row |

## 21.2 Medium Improvements

| Recommendation | Why |
|---|---|
| Consolidate the two date-picker components and two drawer/slide-over components into one each | Removes a real, user-visible design inconsistency and a maintenance burden |
| Centralize `useNavItems.js` as the *only* nav-building logic, removing `Sidebar.jsx`'s duplicate copy | Removes a drift risk between mobile and desktop nav |
| Centralize role-resolution logic behind one source of truth (ideally the backend, with the frontend calling an endpoint rather than reimplementing the numeric-role bucketing) | Removes a drift risk between what the UI shows a user and what the API actually allows |
| Confirm and, if needed, fix HR Settings' persistence model (localStorage vs. real backend) | A multi-admin team currently may not share configuration state if it's browser-local |
| Split `UserController.php` (2,137 lines) into focused controllers (Employees, Appointments, TrialForms, Agents) | Improves testability and reduces regression risk from unrelated changes colliding in one file |
| Add composite indexes on `salary_slips`/`attendances` mirroring the ones already added to `users` | Matches a performance fix already proven necessary on a sibling table |
| Resolve the `PermissionMatrixController`/git-status discrepancy deliberately (either finish removing it or finish restoring it) | Currently ambiguous dead code that could confuse future maintainers about the system's real authorization surface |
| Consolidate the duplicate quiz-management UI (`TrainingQuizPage.jsx` vs. Assessment tab's Quiz Library) | Two independent implementations of identical CRUD over the same table is pure duplicated maintenance surface |
| Add server-side stage-adjacency enforcement to the Hiring pipeline | Currently a direct API call can move a candidate through any stage transition regardless of the frontend's intended pipeline order |

## 21.3 Long-term Improvements

| Recommendation | Why |
|---|---|
| Introduce a real `companies`/`units` relational model with foreign keys, replacing the string-parsing tenancy convention | The single largest structural scalability/data-integrity improvement available; the current approach (comma-lists, `'all'` sentinels reimplemented independently in several places) is the root cause of several other flagged issues |
| Complete the migration off the legacy numeric-role/simple-RBAC layers onto the Enterprise Authorization Platform, then remove the shadow-mode/legacy-fallback code paths | Reduces the authorization system's complexity and audit surface once the rollout is verified safe via `authz:coverage` |
| Introduce a real background job queue (infrastructure already provisioned) for mail sends, bulk imports, and the periodic maintenance Artisan commands | Removes the current "large operations block an HTTP request" pattern and lets `documents:reconcile`-style commands run on an actual schedule instead of manually |
| Build the Permission Matrix UI to completion, replacing the current "Coming Soon" placeholder | The backend services for this (`RoleMatrixBuilder`, `RoleMatrixWriter`, `PermissionCatalogSync`) already exist and are simply unwired — this is largely a frontend + routing effort at this point, not a from-scratch build |
| Add a real leave-management module if the business requires one | Currently entirely absent despite an adjacent `leave` attendance status existing |
| Add malware/AV scanning to the document upload pipeline | The schema, config flag, and `scan_status` column already exist — only the actual scanning integration is missing |

## 21.4 Enterprise Enhancements

| Recommendation | Why |
|---|---|
| Shorten JWT TTL and add a refresh-token flow | Reduces the exposure window of a stolen token from the current 30 days |
| Add MFA/2FA for admin and super-admin accounts specifically | These accounts carry the highest blast radius in the permission model |
| Complete the in-app notification system's backend (real event emitters replacing fixture-seeded data) | The client-side plumbing (Socket.IO, drawer, preference modals) is already built and just needs a real data source |
| Build a genuine Feature Flags admin UI on top of the existing `authorization_feature_flags` table and orphaned `flags`/`updateFlags` controller methods | Currently these flags can only be changed at the database level |
| Re-validate the OTP value itself in the final step of the forgot-password flow | Currently the last step sets a new password without re-checking the OTP submitted earlier in the same flow |

## 21.5 Scalability Suggestions

- Move the string-based tenancy model (see 21.3) to a relational one before onboarding a meaningfully larger number of companies — the current comma-list/`'all'`-sentinel pattern does not scale cleanly past a small, known set of business units.
- Introduce the background job queue (see 21.3) before bulk-import volumes grow enough to risk PHP's request timeout limits even with the existing `set_time_limit(180)` workaround.
- Consider splitting the largest page components (Appointments.jsx, EmployeeManagement.jsx, PerformanceMatrix.jsx, TrialForm.jsx — all 1,400+ lines) into smaller composed components as the team and codebase grow, to keep future feature velocity from degrading.
