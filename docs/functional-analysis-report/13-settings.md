# 14. Settings Documentation

## 14.1 RBAC Settings (`rbac/settings`, backend `SettingsController`)

- **Storage:** generic `settings` table (key/value/group), merged over a `SettingsController::DEFAULTS` array at read time — so an environment with no rows yet still returns sane defaults.
- **Access:** `GET`/`PUT rbac/settings` gated by `admin.configuration.read`/`.update`.
- **Scope:** defaults to the `rbac` group; the table structure supports arbitrary other groups via the `group` column, though no other group was confirmed in use in this pass.
- **Business impact:** this is the one confirmed **server-persisted, multi-user** settings surface in the product.

## 14.2 HR Settings (`/admin/hr/settings`)

- Tabbed UI: **General**, **Notifications**, **Documents**, **Templates** (probation days, notice period, document types, letter templates).
- **Persistence: flagged for direct confirmation** — prior research characterized this screen as **localStorage-backed** (browser-local, not server-persisted) rather than calling a real settings API. Consult `docs/04-pages/hr-performance-assets-exit/HrSettings.md` for the confirmed finding.
- **Business impact if localStorage-only:** these settings would not be shared across admins or devices — each browser would have its own copy, which is a materially different (and likely unintended) behavior for a multi-user HR configuration screen. This should be resolved with the engineering team before any external representation of "HR Settings" as a real, shared configuration feature.

## 14.3 Admin > Manage Admins (`/admin/admins`, component `Settings.jsx`)

- Despite the generic name, this is specifically the screen for a Super Admin to add/edit **other admin accounts**, including a random password generator and lock/unlock actions.
- Gated behind `rawRole === 0` (Super Admin) client-side; **not linked from any sidebar nav** — reachable only by direct URL (see [Navigation Structure](02-navigation.md) §3.4).

## 14.4 Notification Preferences (`NotificationPreferencesModal`)

- Per-user delivery-channel toggles (in-app/email/push/sound) and per-category event-trigger checkboxes.
- Saved via `NotificationContext.savePreferences` — given the broader notification subsystem's fixture-data status (see [Notification System](12-notifications.md)), **whether this actually persists server-side or only to `localStorage` was not independently confirmed** in this pass and should be checked directly if this setting needs to be represented as durable.

## 14.5 Theme (Light/Dark)

- A single boolean, toggled via the header control, persisted to `localStorage("theme")`. Per-company branding can also override the visible theme (`CompanyContext`), except for Super Admin users, who always see the app's default theme regardless of company scope.

## 14.6 Company Scope

Not a "settings" screen in the traditional sense, but a persistent per-session configuration: `CompanyContext` remembers the active company/branch scope in `localStorage` for Super Admin/Master users, resetting to "All Companies" on every fresh Super Admin login by deliberate design (to avoid inheriting a previous user's narrowed scope on a shared login).

## 14.7 Authorization / Feature Flags (backend-only, no dedicated UI confirmed)

`authorization_feature_flags` table (7 seeded flags: `authorization_engine_v2`, `authorization_shadow_mode`, `authorization_field_security`, `authorization_row_security`, `authorization_policy_builder`, `authorization_access_requests`, `authorization_emergency_access`, all enabled by default) — controlled via `FeatureFlags` service. **No frontend settings screen for managing these flags was found**; they would currently need to be changed directly in the database or via a future admin surface. `Api/V1/Authorization/AuthorizationController@flags`/`updateFlags` exist in the controller but are **not wired to any route** (orphaned, see [Bug & Issue Report](19-bugs-issues.md)) — meaning there is currently no way to manage feature flags through the API at all despite the controller code existing for it.

## 14.8 Environment-level configuration (not a UI settings screen, but business-impacting)

Several product-behavior toggles live only in backend `.env` configuration, with no admin UI exposure: `CONFIDENTIAL_AADHAAR_EXPORT_ENABLED`, `DOCUMENT_STORAGE_PROVIDER`, `DOCUMENT_MALWARE_SCAN_ENABLED`, `AUTHZ_ENFORCED_PERMISSIONS`/`AUTHZ_ENFORCED_PREFIXES`, `SHOW_SUPER_ADMIN`/`SHOW_SYSTEM_ROLE`. These require a deployment change (not a UI action) to alter — worth noting for anyone assuming all "settings" are admin-configurable through the product itself.
