# 11. Validation Rules

> Compiled from backend `validate()`/`FormRequest` calls and frontend form logic observed during the codebase inventory. This is a representative, code-grounded catalogue rather than an exhaustive line-by-line extraction of all ~185 endpoints' validation rules — endpoints not explicitly itemized here follow the same Laravel `validate()` conventions.

## 11.1 Identity & account fields

| Field | Rule | Where enforced |
|---|---|---|
| Email | Standard email format, uniqueness on `users.email` | `AuthController@register`, `Api/V1/Admin/UserController@store` |
| Password | Required on create; confirmed (matches confirmation field) on change | `AuthController@changePassword`; frontend `PasswordStrength` component enforces a visual rule checklist (length/case/number/symbol — exact thresholds not independently re-verified in this pass) |
| Emp code | Uniqueness checked live (`check-emp-code` endpoint) before submission; server also validates on create/import | `UserController@checkEmployeeCode`, `AuthController@checkEmpCode` |
| Role (numeric) | Server-side privilege-escalation guard: only an existing Super Admin may create a role-0/1 (Super Admin/Admin) account | `UserController@store` |
| Aadhaar number | Normalized (formatting stripped) client-side before submit; server derives `aadhaar_last_four`/`aadhaar_secure_reference` on write if the schema supports it; **appointment fields are explicitly all-optional** — nothing blocks save for a blank Aadhaar (confirmed by a dedicated frontend test, `AppointmentOptionalFields.test.jsx`) | `AppointmentModal.jsx`, `User` model mutator |
| PAN card number | Format field present; no independent server-side regex format check was confirmed in this pass | Appointment/Employee forms |

## 11.2 Employee / HR fields

| Field | Rule |
|---|---|
| Department name | Required, non-empty (`AddNewDepartment.jsx` / `AdminController@storeDepartment`) |
| Trial Form fields | Company-scoped (Nidhi Impex feature-gated in the nav); protected fields (`TRIAL_FORM_PROTECTED_FIELDS`) are stripped from any client-submitted update so a caller cannot silently overwrite server-managed fields |
| Bulk import rows | Each row validated for employee-code presence/duplication and required-field completeness before commit; failures are recorded per-row in `upload_batch_rows` (status + reason) rather than aborting the whole batch |

## 11.3 Payroll

| Field | Rule |
|---|---|
| Salary slip `emp_code` | Changed from integer to string(100) specifically to allow alphanumeric codes (e.g. `S1145`) — a historical data-model correction |
| Bulk salary upload | Per-company Excel header template validated on parse (`components/admin/BulkSalaryValidation.jsx`); month-value recognition validation flagged specifically as an added check beyond employee-code validation |

## 11.4 Attendance

| Field | Rule |
|---|---|
| Attendance status | Constrained to `present`/`absent`/`half_day`/`leave` (`Attendance::STATUSES`) |
| Attendance cell key | Unique per [emp_code, company_code, date] at the DB level — prevents duplicate attendance rows for the same employee/day |

## 11.5 Hiring / ATS

| Field | Rule |
|---|---|
| Job Requisition | `publish` requires status already `approved` (enforced in `JobRequisitionController`, not just UI-hidden) |
| Offer | `release` requires status already `approved` (`OfferController`) |
| Candidate stage | Constrained to the pipeline's defined stage set (`stageMeta.js` on the frontend, `stage` string column on the backend); a data migration (`collapse_candidate_interview_stages`) previously merged three legacy stage values into one canonical `interview` stage. **Note:** page-level research on the Hiring module found the backend's `moveStage` endpoint does not itself enforce stage-adjacency — any of the 10 valid values is accepted as a transition target from any current stage; the pipeline-order discipline lives only in the frontend's tab-ownership model. |
| Interview feedback | `rating` constrained to 1–5 (tinyint); unique per [interview_id, panelist_id] — one feedback submission per panelist per interview |
| Performance Goal `type` | Constrained to `KPI` \| `KRA` \| `OKR` |
| Performance Review `review_type` | Constrained to `self` \| `manager` \| `peer` \| `360`; unique per [cycle_id, user_id, reviewer_id, review_type] |
| Quiz question answer key | `correct_index` is stripped server-side before any question set is served to a candidate (`TrainingQuiz::questionsForCandidate()`) — a security-relevant validation/sanitization step, not just a data-shape rule |

## 11.6 Documents

| Field | Rule |
|---|---|
| File size | Max 10MB by default (`DOCUMENT_MAX_FILE_SIZE_BYTES`) |
| File type | Extension allow-list + MIME allow-list per document type + magic-byte signature verification (see [Security Audit](16-security-audit.md) §17.4) — a file failing any one of the three checks is rejected |
| Filename | Every dot-segment checked against a blocked-extension list (catches `name.pdf.php`-style disguises) |
| Document version | Positive integer enforced via a Postgres CHECK constraint (`version > 0`); `file_size >= 0` similarly enforced at the DB level, not just in application code |

## 11.7 Tickets

| Field | Rule |
|---|---|
| Ticket subject/description | Required, validated in `TicketController@store` |
| Priority | Constrained to the enum defined in `Ticket` model constants |
| Reopen window | A resolved ticket may only be reopened within 7 days (`Ticket::REOPEN_WINDOW_DAYS`); a closed ticket can never be reopened (`canBeReopened()` enforces both rules) |
| Status transitions | Enforced via an explicit `TRANSITIONS` state-machine map and `canTransitionTo()` — an invalid transition is rejected at the model layer, not just hidden in the UI |

## 11.8 Access Control / Authorization

| Field | Rule |
|---|---|
| Role code | Cannot be a "reserved" code that carries a tier by definition (Admin/internal-identity codes) — privilege-escalation guard on role creation |
| Role code normalization | Homoglyph/whitespace/zero-width-character normalizer specifically prevents registering a lookalike of a reserved code (e.g. a fancy-dash `super‑admin`) |
| Access Request / Emergency Access reason | A business/incident reason is required to submit (self-service) and to approve/reject (staff) |
| Admin user mutating actions | `lock`/`deactivate`/`resetPassword` require a reason string of 5–10+ characters; `activate`/`assignRole`/`assignPermissions` make the reason optional |
| Role deletion/archival | Blocked for any role flagged `is_system`/protected, regardless of the acting user's permission grants (unless truly Super Admin) |
| Self-role-editing | Blocked outright — "nobody edits their own tier here" (`RoleHierarchy::canManageUserRoles()`) |
| Emergency Access window | UI states a 24-hour maximum for a grant's validity, but this is **not enforced client-side** — the field is a plain datetime picker with no range check; whether the backend enforces it independently was not confirmed in this pass |

## 11.9 Frontend-only validation notes worth flagging

- Several "forms" in the app are not semantic `<form>` elements but plain divs with `onClick`-wired buttons (noted during the frontend inventory pass) — this means native browser form validation (`required`, `pattern`, etc.) does not apply to them, and correctness depends entirely on manual JS validation logic being present and correct in each case. This is a code-quality/consistency observation, not a confirmed defect in any specific screen — see [UI/UX Audit](17-ui-ux-audit.md).
- The custom `ModernDatePicker`/`DatePicker` components include their own manual-entry validation (rejecting impossible/out-of-range typed dates), independently of any backend date validation — a good defense-in-depth pattern, assuming the backend also validates (not independently re-confirmed for every date field in this pass).
