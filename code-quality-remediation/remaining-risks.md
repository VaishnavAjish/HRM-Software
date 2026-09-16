# Remaining risks and decisions needed

Ordered by severity. Items marked **Owner action** cannot be closed by a code change.

## P0

1. **Every role holds every Mediclaim permission in the live database** — *Owner action.*
   Migration `2026_09_15_000031_grant_mediclaim_permissions_to_all_roles_for_local_testing` ran on `niss_hrms` (batch 60). Read-only check: `emp`, `employee`, `agent` and all other active roles each hold 55 `mediclaim.*` / `self.mediclaim.*` grants, including claim decisions, HR verification, settlement and reports. Any employee or agent account can reach medical-claim administration for other employees.
   Code fix applied: the migration now no-ops outside `local`/`testing`, so it cannot re-apply on AWS or future deployments. **The existing grants remain until someone removes them**, e.g. per role in the Permission Matrix or with a reviewed revocation script that keeps only the intended `self.mediclaim.*` grants for `emp`/`employee`. Not executed here because it writes to the live database.

2. **Mobile app and `AppIcons` folders were deleted from disk at ~14:43** — *Owner action.*
   `F:\HRMS oldd\NISS HRMS` (110 tracked files) and `F:\HRMS oldd\AppIcons` (42 tracked files) no longer exist. Git shows them as deleted; no git operation did it and this remediation issued no such delete. If unintentional, `git checkout -- "NISS HRMS" AppIcons` restores tracked content (untracked `node_modules`, `ios`, `.expo` are not recoverable from git). The mobile URL fix and new tests (see `changes-made.md`) must then be re-applied.

3. **Deployed builds still contain the fixed data exposures.** Role-1 cross-company access to employees, trial forms and salary slips, the password-reset account-takeover path and address oracle, and the self-approving requisition flow are fixed in the working tree only. LAN picks them up on `php artisan serve` restart; AWS (`niss.pro`) needs a deploy. Nothing is committed.

## P1

4. **157 enforced permission codes have no Permission Matrix owner** (Workforce, Organization Domain 02, Mediclaim, `hr.training.*`). Administrators cannot grant or deny them in the UI; they only change through migrations, which is how item 1 happened. Needs product design of registry nodes. `ReverseRouteCoverageTest::no_new_business_code_lacks_a_canonical_owner` stays red until then.
5. **Role 1 means different things in different modules.** `EmployeeScopeGuard`, employees, salary slips and assets scope role 1 to its companies; `ScopesCompany` (HR, Mediclaim admin lists) and `VerifiesCompanyAccess` (Organization services) treat role 1 as global. In HR/Mediclaim lists a role-1 admin can see rows that the record guard then refuses to open. Decide one rule; `ScopesCompany::globalCompanyScopeRoles()` is the single switch.
6. **Approved/posted requisitions remain editable** (`JobRequisitionController::update`, widened in `fd67ff54`). Headcount or budget can change after Director approval without a new approval cycle. Pending-review states are now locked.
7. **Manager Section team access is title-based.** `UserController::resolveSubordinateIds` grants a department-wide team view to anyone whose designation, type or role contains "manager", "head", "director", matched with `LIKE %dept%`. Pre-existing at HEAD, broadened by the uncommitted work.
8. **`AuthorizationController::legacyPortalFor`** sends any role whose code contains `admin` or `hr` (`LIKE '%hr%'`) to the admin shell.
9. **Frontend test suite: 100 failing tests remain.** 94 outside Mediclaim fail identically at HEAD (stale copy in Appointment/Careers tests, removed requisition wizard, incomplete API mocks). The Mediclaim folder at HEAD hangs, so its 6 failures have no baseline; agents traced them to stale expectations and in-progress owner work (`EmployeeMediclaimWorkspace` tab rewrite, `SubmitClaimTab` `memberId` vs `member_id`).
10. **Workforce module cannot create records yet.** Company/enterprise/family/level/grade selects have no options, so `companyId` is sent as `0` and backend validation rejects creation; status filter values are uppercase while stored values are lowercase; `Badge` ignores its `status` prop in 42 places.

## P2 / P3

11. The Laravel test suite runs PHP 8.5 with one PHPUnit deprecation notice on every run.
12. `PrivilegedAccessController::activate/revoke` compare `requester_id !== $user->id` strictly; if the attribute is not cast to int on PostgreSQL the rightful requester is refused (fails closed).
13. `Login.jsx` displays `dev_otp` in a toast whenever the backend returns it (only with `OTP_DEV_FALLBACK=true`). `Profile.jsx` writes Aadhaar/PAN/bank numbers into the stored user object in localStorage.
14. `NISS HRMS/app.json` sets `NSAllowsArbitraryLoads: true` (documented LAN mode). A store release should remove it once HTTPS is the only target.
15. `MODULE_TYPELESS_PACKAGE_JSON` warning in the mobile tests is accepted: `babel.config.js` and `metro.config.js` are CommonJS loaded by Node, so `"type": "module"` would break Metro/Babel.
16. Organization pages that are not routed (LegalEntityProfiles, HierarchyNodes/Edges, ReportingStructure status toggle) have functional defects listed in `changes-made.md`; they are unreachable today.
17. `RuleBookViewer.jsx` (uncommitted owner work) contains one `eslint-disable-next-line react-hooks/exhaustive-deps`. It predates this remediation and was left in place.
18. No PHP static analysis (PHPStan/Larastan/Psalm) is configured. `laravel/pint` is installed but has no configured gate.
19. `dist/sw.js` in the frontend was regenerated by the production build check (Vite PWA writes to `dist/` regardless of `--outDir`). Its precache list matches the current `dist/` contents.
