# Changes made

Nothing was committed, pushed or deployed. All changes are in the working tree alongside pre-existing uncommitted owner work, which was preserved.

## Backend — `salary-slip-bac`

| File | Reason | Risk | Change |
|---|---|---|---|
| `app/Http/Controllers/Admin/Hr/Concerns/ScopesCompany.php` | P0 cross-tenant: substring `LIKE %code%` match; role 1 global | Medium (authorization) | Exact CSV membership with `ESCAPE '!'` (pgsql/mysql/sqlite); `globalCompanyScopeRoles()` hook, default unchanged `[0, 1]` |
| `app/Http/Controllers/UserController.php` | P0: role-1 admins saw all companies' employees/trial forms since `6abc168b`; uncommitted dept-head code 500'd on alphanumeric emp codes and wrote on GET | Medium | Override global roles to `[0]`; dept-head detection by numeric id only; removed GET-side designation mass update and dead identifier arrays; `managerCheck`/`resolveSubordinateIds` query bigint columns by id |
| `app/Http/Controllers/SalariesSlipController.php` | P0: role-1 admins listed every company's salary slips | Low | Override global roles to `[0]` (matches its own `show()`) |
| `app/Http/Controllers/Admin/Hr/AssetController.php` | List/show scope disagreement for role 1 | Low | Override global roles to `[0]` |
| `routes/api.php` | Documented-ungated self-description endpoints returned 403 | Low | Removed `permission:self.profile.read` from `v1/authorization/me`, `check`, `check-batch`, `POST v1/access-requests`, `v1/provisioning/company-options`; requisition close accepts `hr.requisition.update` or `hr.requisition.job_portal.publish`. Delegation gates kept (registry requires them). |
| `app/Http/Controllers/AuthController.php` | P0/P1: reset OTP to caller-supplied number; enumeration; 422 on failed send; mobile number logged | Medium (auth) | OTP only to number on file; identical generic reply for unknown/no-mobile accounts (specific errors kept on the identity-verified path); 500 on failed send; mobile not logged |
| `app/Services/Hr/JobRequisitionApprovalService.php` | P1 separation of duties; MySQL `||` concat | Medium (workflow) | `assertIndependentReviewer()` on HR forward, return, respond and Director decision; driver-agnostic approver company filter |
| `app/Http/Controllers/Admin/Hr/JobRequisitionController.php` | 500 on forward without director; edits during review | Low | Null-safe `director_id`; editable states `draft`, `rejected`, `revision_requested`, `approved`, `posted` |
| `app/Services/Organization/{OrganizationChangeManagement,FinancialOrganization,LegalEntity,Location,OrganizationHierarchy,OrganizationLocation}Service.php` | Undefined `code` key → 500 | Low | `($data['code'] ?? '') ?: name` |
| `app/Models/PositionHistory.php` | Wrong table name | Low | `$table = 'position_history'` |
| `app/Models/ReportingRelationship.php` | Ending a relationship left `status=active` | Medium (escalation) | Dirty-side propagation for id/manager/notes/active-status mirrors on update |
| `app/Services/Documents/DocumentAudit.php` | Failed audit insert poisoned Postgres transaction | Low | `recordSafely` writes inside `DB::transaction` (savepoint) |
| `app/Http/Controllers/Api/V1/Authorization/AuthorizationController.php` | Snapshot 500 on legacy schema | Low | `SchemaSupport::hasColumn('roles','code')` guard |
| `app/Http/Middleware/RequireModuleSchema.php` | Module-absence disclosed to non-admins | Low | 403 for hr/organization/authorization unless tier 0-2, super admin, or `ui.portals.business` |
| `app/Http/Controllers/Admin/AdminController.php` | MySQL `||` concat | Low | Driver-agnostic CSV match |
| `app/Support/PermissionRegistry.php` | Duplicate `ui.hr.organization` key; wrong interview mapping; unowned codes | Low | Removed dead duplicate; feedback node maps feedback route only; added enterprise, unit-assignment and privileged-access nodes |
| `database/seeders/EmployeeSelfServicePermissionSeeder.php` | Employee pages missing | Low | Added `ui.portals.employee_mediclaim`, `ui.portals.employee_security` |
| `database/migrations/2026_09_15_000031_grant_mediclaim_permissions_to_all_roles_for_local_testing.php` | P0 grant-everything migration | Low | No-op outside `local`/`testing` |
| Tests: `EmployeeListScopeTest`, `AssetCrossCompanyApiTest`, `AccessLifecycleApiTest`, `PasswordResetOtpSecurityTest`, `JobRequisitionApprovalWorkflowTest`, `RecruitmentDashboardTest`, `EmployeeAadhaarDisclosureTest`, `PortalCapabilityTest`, `RegistryApiContractTest`, `ReverseRouteCoverageTest`, `Mediclaim/{FloaterCalculation,Intimation,CardQrPrivacy,AuditCompleteness}Test` | Stale contracts, fixtures, characterisation of fixed bugs | — | Brought to current contracts; no assertion weakened; new assertions for prefix collisions, caller-supplied numbers, log leakage, self-approval, review-state lock, soft delete |

## Frontend — `salary-slip-front/salary-slip-front`

Five parallel agents on disjoint file sets plus the audit-named files. Rules: no `eslint-disable`, no config changes, no timer/microtask wrappers, primitive dependencies, no code comments.

| Area | Files | Runtime defects fixed |
|---|---|---|
| Workforce | `pages/admin/workforce/*` (14), `features/workforce/services/workforceApi.js`, new `features/workforce/utils/jsonField.js` | Factory → real `WorkforceListPage` component; View modal crash on every page; Edit crash on 6 routed pages; save never worked (`form` undefined); `useNavigate` not imported (4 pages crashed on load); wrong `Pagination` props; JSON fields could not be typed; malformed Jobs edit form; corrupted `₹` symbol; 3 unparseable unrouted pages; the broken rename left by the other session (12 importers) was restored first |
| Recruitment / Organization | `pages/admin/recruitment/RecruitmentDashboard.jsx`, `pages/admin/organization/*` (8), `features/organization/*` | Recruitment dashboard crashed on load (29 missing imports, broken `KpiCard`, missing export); `Modal` not imported; filters sent React setters as API values; `toast.info` (not in react-hot-toast 2.6); preview sent the click event as payload; `OrgResourceManager` wiped typed input on parent re-render |
| Mediclaim | 24 files in `features/mediclaim/**` | Request-key derived loading with cancellation everywhere; `SubmitClaimTab` briefly counted the previous claim's documents; `[user]` dependencies that re-fetched on every render under mocked auth |
| HR | 20 files in `pages/admin/hr/**` | Bulk assign crashed (`toast.info`) and reported failed moves as success; fake apply link in job preview; saving a requisition did not refresh lists; `EmployeeDrawer` showed the previous employee's documents; infinite skeleton in Performance Matrix; stale responses overwriting newer ones; 23 existing suppression/dodge comments removed |
| Shell / context / careers / misc | `components/**`, `context/**`, `pages/careers/**`, `pages/admin/{Appointments,EmployeeManagement,AttendanceView}.jsx`, `pages/auth/Login.jsx`, `pages/employee/Profile.jsx`, `accessControl/CompanyUnits.jsx` | Careers "clear search" re-ran the old term; out-of-order job responses; Appointments showed the previous record's documents; corrupt localStorage key blocked the others; `AudioContext` leak; contexts split into `context/candidate-auth-context.js` and `context/notification-context.js` (29 importers and mocks repointed); unreachable shadowed `isSameDepartment` removed |
| Audit-named files | `pages/public/CandidateQuiz.jsx`, `pages/public/MediclaimCardVerify.jsx`, `pages/employee/ManagerSection.jsx`, `utils/pdfUtils.js`, `utils/payslipUtils.js` | See `finding-verification.md` #3–#7 |
| Copy | `pages/auth/Login.jsx` | "6-digit OTP" → `{OTP_LENGTH}`-digit |
| Test infrastructure | `vitest.config.js`, `src/test/setup.js` | Restored `setupFiles` (removed in `8f962d0f`); in-memory Storage when the runtime provides none (Node 26 shadows jsdom's) |

Removed code that may have been intended is listed in each agent's notes: dead requisition wizard copies in `HRManagerTab`/`RequisitionsTab`, unwired Add/Edit buttons in unrouted organization pages, unused KPI-template state, `DatePicker` `required` prop, hidden announcements tab setter.

## Node service — `salary-slip-node`

| File | Change |
|---|---|
| `src/lib/laravel/jwt.test.ts` | Fixture checks run at the fixture's `iat`; added exp-boundary test |

## Mobile — `NISS HRMS` (deleted from disk after remediation)

`src/config/apiUrl.js`:

```js
export const PROD_API_URL = 'https://niss.pro/api';
const ABSOLUTE_URL = /^(https?):\/\/[^\s/?#]+(?:[/?#]\S*)?$/i;
function rejectOverride(value, reason) { console.warn(`EXPO_PUBLIC_API_URL "${value}" ignored (${reason}); using ${PROD_API_URL}`); return PROD_API_URL; }
export function resolveApiBaseUrl({ envUrl, isDev = false } = {}) {
  const candidate = String(envUrl || '').trim().replace(/\/+$/, '');
  if (!candidate) return PROD_API_URL;
  const match = ABSOLUTE_URL.exec(candidate);
  if (!match) return rejectOverride(candidate, 'not an absolute http(s) URL');
  if (!isDev && match[1].toLowerCase() !== 'https') return rejectOverride(candidate, 'cleartext http is only allowed in development builds');
  return candidate;
}
const ENV_URL = typeof process !== 'undefined' && process.env ? process.env.EXPO_PUBLIC_API_URL : undefined;
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__ === true;
export const API_BASE_URL = resolveApiBaseUrl({ envUrl: ENV_URL, isDev: IS_DEV });
```

`__tests__/helpers.test.mjs` gained tests for: non-loopback/private production host, localhost allowed only in dev, malformed/`ftp:`/`javascript:` overrides, whitespace and repeated trailing slashes, case-insensitive scheme. Result before deletion: 12/12 pass. `BUILD_IOS.md` line 40 still states the old LAN default and should say local builds set `EXPO_PUBLIC_API_URL`.

## Temporary artefacts

Created and deleted: `src/utils/__diffcheck_*` (payslip differential test), `tests/Feature/ZzDiagProfileUpdateTest.php`. Scratch copies of HEAD live only in the session scratchpad.
