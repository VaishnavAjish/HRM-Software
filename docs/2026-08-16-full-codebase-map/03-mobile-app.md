# Mobile App — `hrms-mobile-app` (React Native / Expo)

Talks to the **same Laravel backend** as the web frontend (`API_BASE_URL` resolves to `https://niss.pro/api` in production; `src/config/apiUrl.js`) — not a separate system, not `salary-slip-node`, not `enterprise-rbac`. JWT stored in `expo-secure-store` (device keystore), never AsyncStorage. `resolveRole()` in `src/utils/role.js` explicitly mirrors the web app's role-branching logic.

## Navigation

No React Navigation library — a hand-rolled tab switcher in `App.js`, role-gated:
- **Employee**: Home, Payslips, Tickets, Profile
- **Agent**: Dashboard, Appointment, Trial Form, Profile
- **Admin**: Dashboard, Employees, Salary, Forms, More (→ sub-navigation for Attendance/Shifts/Accounts/TDS/HR/Tickets)

## Screens by role

**Auth**: `LoginScreen`, `SetPasswordFlow` (3-step first-time/forgot-password: verify employee → verify email OTP → set password).

**Employee**: `HomeScreen` (dashboard, cached in AsyncStorage for instant repaint), `PayslipScreen` (list/detail/PDF download).

**Agent**: `AgentDashboardScreen`, `AgentAppointmentsScreen` (+ exports `AdminAppointmentsList` reused by admin), `AgentTrialScreen` (+ exports `AdminTrialList`), `AppointmentFormScreen`, `TrialFormScreen`.

**Admin**: `AdminDashboardScreen`, `AdminEmployeesScreen`, `AddEmployeeScreen` (**dead code — not reachable from any navigation path**), `AdminSalaryScreen`, `AdminSalaryUploadScreen`, `AdminFormsScreen`, `FormDetailScreen`, `AdminMoreScreen` (hub), `AdminTicketsScreen` (fully functional), `AdminAttendanceScreen` (real), `AdminAttendanceUploadScreen` (explicit "Coming soon" stub, with a code comment explaining the real backend contract wasn't matched yet), `AdminShiftsScreen` (real), `AdminAccountsScreen` ("Access Control" — **fabricates a per-user permission matrix client-side** by string-matching the viewing admin's own permission codes, not the target user's actual grants), `AdminTdsScreen` (**100% hardcoded mock data**, zero API calls), `AdminHrScreen` (read-only hiring pipeline + directory view).

**Shared**: `ProfileScreen`, `TicketScreen` (employee's own tickets, real).

## Known defects (verified in code)

1. **Broken API calls**: `AdminEmployeesScreen.js` calls `api.bulkDeleteEmployees()` and `api.deleteAdminEmployee()` — neither exists on `ApiService` (`src/services/api.js`). Bulk-delete and detail-view delete will throw at runtime.
2. **Dead code**: `AddEmployeeScreen.js` is fully built (form + bulk XLSX import) but never wired into navigation.
3. **Two different code paths for the same feature, different fidelity**: `AdminMoreScreen`'s own Attendance/TDS tiles are hardcoded "Coming soon" stubs, separate from the real, functioning `AdminAttendanceScreen` reachable via the bottom tab bar.
4. **Mismatched call shape**: `FormDetailScreen`'s appointment approve/reject calls `api.request('/appointment/update/${id}', {...})`, a route/shape not exposed as a first-class `api.js` method; the call is wrapped in `.catch(() => null)` so failures are silently swallowed — this path is unverified/likely broken against the real backend contract.
5. **Fabricated data presented as real**: `AdminAccountsScreen`'s permission matrix (see above).
6. **Fully mock screen**: `AdminTdsScreen` — no API integration at all.

## Services / hooks

`src/services/api.js` — single `ApiService` (~50 methods) wrapping `fetch`, bearer JWT from in-memory token. `pushNotifications.js` — deliberately bypasses `ApiService` (uses `fetch` directly) because background-fetch wakes in a fresh JS context with no in-memory token; polls every 60s foreground, Android 15-min floor in background. `useNotifications.js` — merges real server notifications with **client-derived** synthetic notifications (since the backend currently only writes real notification rows for the Tickets module). `AuthContext.js` exposes a soft `can(code)` permission check that defaults to `true` if the permission snapshot hasn't loaded — used only to hide individual buttons, never for whole-screen gating; cold start always re-validates the token against `/profile`, no offline "already logged in" shortcut.

`companyConfig.js` hardcodes the same company/unit lists as the web app's `companyConfig.js` (Nidhi Impex: Shreeji/Ichapur; Silver Star: Daduk/Ichapur) — not server-driven, must be kept in sync manually across both clients if it ever changes.
