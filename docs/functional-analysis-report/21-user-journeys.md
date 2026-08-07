# 22. User Journey Documentation

## 22.1 Super Admin

1. Logs in → lands on `/admin` (Admin Dashboard), with every nav gate bypassed.
2. Manages the full tenant landscape via `CompanyScopeDropdown` — starts every fresh login on "All Companies" scope by deliberate design.
3. Creates/edits other Admin accounts via `/admin/admins` (the un-linked "Manage Admins" screen) — the only role that can create role-0/1 accounts.
4. Full Access Control authority: Users, Roles, Policies, Access Requests, Delegations, Emergency Access — approves access requests and emergency grants raised by others.
5. Sees "Ticket Control Center" instead of the plain staff "Tickets" label — the full helpdesk console (dashboard, per-status queues, SLA rules, reports).
6. Every authorization decision they trigger is still logged (`SUPER_ADMIN_BYPASS`), even though never denied.
7. Can be hidden from normal user listings (`is_hidden`) and is protected from being edited/deleted by anyone but another super admin.

## 22.2 Admin (Tenant Administrator)

1. Logs in → lands on `/admin`, scoped to their `company_code`(s).
2. Day-to-day: manages Employees (create/edit/import), reviews incoming Appointment Forms, converts approved appointments into employee accounts.
3. Monthly: uploads salary slips (bulk Excel, per-company template), generates Form 16 for employees, reviews Attendance grids (read-only — see [Bug & Issue Report](19-bugs-issues.md) for the current gap in attendance-marking UI).
4. Recruitment: creates Job Requisitions, reviews the Candidate pipeline, schedules Interviews, manages Offers, tracks Onboarding of accepted candidates.
5. People management: runs Performance cycles/reviews, allocates Assets, processes Exit/resignation requests.
6. Support: works the staff Ticket queue (assign, reply, resolve).
7. If granted `admin.*` permissions: also manages Users/Roles/Policies in Access Control (in practice, per the role model, this level of access is typically reserved for Super Admin, but the permission system does not structurally prevent a Tenant Administrator from being granted it).
8. Cannot create another Admin or Super Admin account (privilege-escalation guard blocks this at the API layer even if attempted).

## 22.3 HR Manager / HR Staff (a permission profile within the Admin role, not a distinct login role)

1. Primarily lives inside the HR module: Hiring Workspace (all 5 tabs), Onboarding Workspace, Performance Matrix, Asset Allocation, Exit Management, HR Reports, HR Settings.
2. Assigns candidate quizzes, reviews attempt reports, schedules interviews, collects panelist feedback.
3. Approves requisitions and offers if granted the `.approve` permission specifically (separate from general HR update rights).
4. Reviews onboarding documents for accept/reject, tracks new-hire journeys derived from the Candidate pipeline (no separate onboarding data model).

## 22.4 Employee

1. First login (or incomplete profile at any time) → force-redirected to `/employee/profile` until all 17 required fields are complete; every other nav item is hidden until then.
2. Views own Dashboard (salary stat cards + trend), Payslips history, downloads own Form 16.
3. Can view (but not edit past submission) their own Appointment Form record.
4. Raises Support Tickets and tracks them via My Tickets; sees a (mock, heuristic-based, not AI) category hint while typing a ticket subject.
5. Views their own full Aadhaar number on their own profile (the one place the full, unmasked number is shown to a non-admin).

## 22.5 Agent (field/recruitment agent)

1. Logs in → lands on `/agent` (Agent Dashboard): a table of everything they themselves have submitted (candidates/appointments/trial-forms).
2. Submits Appointment Forms and (if company-scoped to Nidhi Impex or "all-companies") Trial Forms on behalf of prospective employees — using the exact same `AppointmentModal`/`TrialFormModal` components an Admin would use.
3. Can "process as appointment" — hand off an approved Trial Form into the full Appointment flow.
4. Sees only their own submitted records; cannot see other agents' candidates (`getAgentCandidates` explicitly scopes to the requesting agent).
5. Has no access to Employees, Payroll, Attendance, HR, or Access Control at all.

## 22.6 Recruiter (a permission profile, typically an Admin/HR user with `recruitment.*`/`hr.candidate.*` grants — not a separate login role)

Follows the same journey as HR Manager (22.3) but the term appears specifically in permission naming (`recruitment.trial_form.*`, `recruitment.candidate.read`) and in the `Candidate.recruiter_id` field — i.e., "Recruiter" is a data-model concept (who owns a candidate) more than a distinct authentication role in this codebase.

## 22.7 Candidate (never authenticates into the main application)

1. **Path A — Google Form intake:** fills out the shared Google Form; an Apps Script relay posts the submission to `candidate-intake/{token}`, creating a `candidates` row automatically, no login ever involved.
2. **Path B — Manually added:** an Admin/Recruiter adds them directly via the Hiring Workspace's Candidates view.
3. Progresses through the pipeline stages (see [Workflow Documentation](07-workflows.md) §8.4) entirely from the recruiting team's side — the candidate has no portal to check their own status.
4. **Only interactive touchpoint:** if assigned an assessment, receives a shareable link (`FRONTEND_URL + /quiz/{access_token}`) via email (`AssessmentInviteMail`) or manual copy-paste, and takes the proctored quiz at `/quiz/:token` — a standalone page outside the normal app shell, authenticated only by possessing the token, with fullscreen enforcement and violation tracking (tab-switch, blur, fullscreen-exit, copy-paste, devtools-shortcut) leading to auto-submit/auto-terminate past a threshold.
5. Also receives interview-scheduled and offer-letter emails at the relevant pipeline stages, with resume access available to admins via an intentionally unauthenticated iframe-embeddable streaming URL (`candidates/{id}/resume`).
6. Their real-world offer response (accept/reject) is recorded on their behalf by internal HR staff, not submitted directly by the candidate through any portal — see [HR Hiring module doc](03-modules/hr-hiring.md).

## 22.8 Cross-cutting journey notes

- **Company scope** shapes every journey above except Employee/Agent/Candidate: a Super Admin/Master choosing a narrower company scope temporarily experiences the app similarly to a single-company Admin.
- **Module availability** can silently remove entire journeys' worth of nav items (HR, Tickets, and nominally Access Control) in an environment where those tables haven't been migrated yet — a new deployment's Admin journey may look noticeably smaller than a fully-provisioned one, by design.
- **Mobile/native app users** (Capacitor Android/iOS) follow the same journeys as their web counterparts, with device-specific accommodations noted for Employees specifically (e.g., PDF-download fallback instead of print dialog for the Appointment view).
