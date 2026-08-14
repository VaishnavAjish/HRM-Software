# Operator Remediation Runbook — 2026-08-14

> **PREPARED, NOT EXECUTED.** Every step below is a manual operator action. This
> document changes nothing on its own. Run the steps in order, in a maintenance
> window, and verify each before moving on. Nothing here was performed by the
> engineer who wrote it: no secrets were rotated, no files deleted, no services
> restarted, no production database touched.

This runbook accompanies the P0/P1 code remediation landed on 2026-08-14 (agent-
migration containment, employee-creation lockdown, mobile hardening, password-
change session revocation, fail-safe authorization defaults, department tenant
isolation, storage-route hardening, attendance import bounds). Those code changes
are inert until deployed and, in two cases (env/debug and the JWT middleware
alias), until the PHP runtime is restarted.

Related: [AUDIT-2026-08-13-full-application-readonly.md](AUDIT-2026-08-13-full-application-readonly.md),
[REMEDIATION-2026-08-13-status-and-runbook.md](REMEDIATION-2026-08-13-status-and-runbook.md).

---

## 0. Preconditions

- A maintenance window (some steps log users out).
- A verified, restorable database backup taken immediately before Section 6.
- Access to the production host, the AWS console/IAM, the DNS/mail/SMS providers,
  and a secrets manager (or a secure offline vault) to hold new values.
- **Never** paste an old or new secret into a ticket, chat, commit, or log.

---

## 1. Rotate the EC2 keypair and every archived secret

Treat everything that was ever inside `deploy_clean.zip` / `deploy.zip` and the
on-disk `HRM.pem` as **compromised**. Rotate, do not reuse.

1. **EC2 SSH keypair (`HRM.pem`)** — create a new keypair, add the new public key
   to the instance (`~/.ssh/authorized_keys` or via the console), confirm you can
   log in with the new key, then remove the old public key from the instance and
   deactivate the old keypair in AWS.
2. **AWS access key** (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) — prefer an
   **instance role** over a static key. If a static key is required, create a new
   IAM key, update `.env`, verify S3 upload/download, then deactivate and delete
   the old key.
3. **`JWT_SECRET`** — rotate (see Section 3 for the invalidation consequence).
4. **`DB_PASSWORD`** — rotate the Postgres role password, update `.env`,
   `config:cache`, confirm reconnect (web + any worker).
5. **`MAIL_PASSWORD`** — rotate at the mail provider, update `.env`, send a test
   mail.
6. **`FAST2SMS_API_KEY`** — rotate at Fast2SMS, update `.env`, send a test OTP to
   a controlled number.
7. **`APP_KEY` / `AADHAAR_REFERENCE_SECRET`** — see Section 2; do **not** rotate
   these casually.

Update each new value in the secrets store / `.env` and verify the dependent
feature works **before** proceeding.

---

## 2. APP_KEY / Aadhaar secret — do NOT rotate blindly

`APP_KEY` decrypts every `encrypted` column (Aadhaar at rest) and signs URLs;
`AADHAAR_REFERENCE_SECRET` derives stored Aadhaar reference hashes. A blind
rotation orphans that data.

- If `APP_KEY` must change, use Laravel's supported previous-key strategy: set
  `APP_PREVIOUS_KEYS` to the old key so existing ciphertext still decrypts while
  new writes use the new key. Plan a re-encryption pass before removing the old
  key from `APP_PREVIOUS_KEYS`.
- `AADHAAR_REFERENCE_SECRET` rotation requires re-deriving stored references (a
  data migration). Only do this deliberately, with a backup and a tested
  migration.
- If neither was actually exposed in a way that requires rotation, prefer leaving
  them and rotating the other secrets — but confirm that judgement explicitly.

---

## 3. Invalidate old JWTs after rotating `JWT_SECRET`

Rotating `JWT_SECRET` invalidates every existing 30-day token immediately; all
users re-login. Communicate the window. If `salary-slip-node` is deployed and
shares the secret, rotate it there too (or give each service a distinct secret /
enforce `iss`/`aud` on verify).

**Also note (new this release):** the `jwt.auth` middleware alias was being
silently overridden by tymon's default `Authenticate`, so the password-change
revocation check never actually ran. It now runs (`AppServiceProvider::boot`
re-asserts the alias). After the restart in Section 5, any user who already has a
`users.password_changed_at` value and still holds a token issued before it will
be logged out on their next request — expected, and the point of the fix. Sanity-
check the affected count first (read-only):

```sql
SELECT count(*) FROM users WHERE password_changed_at IS NOT NULL;
```

---

## 4. Quarantine sensitive files before deletion

Do **not** delete in place first. Move to a controlled quarantine **outside** the
repository and web root, verify replacements, then delete.

- `HRM.pem`, `deploy_clean.zip`, `deploy.zip`, `salary-slip-front.zip` — move to
  an access-controlled location off the serving host (or a secure vault), confirm
  the new EC2 key and rebuilt artifacts work, then securely delete the originals.
- They are gitignored, so git history is clean; this is a working-copy cleanup.
- Verify the app still serves (assets, S3, deploy pipeline) using the rotated
  credentials and rebuilt artifacts **before** the final delete.

---

## 5. Apply config, restart the runtime, restart workers

The `.env` already reads `APP_ENV=production` / `APP_DEBUG=false`, but the running
`php artisan serve` / php-fpm process cached the old env at boot, and the
`jwt.auth` alias fix only takes effect on a fresh process.

1. `php artisan config:clear` then `php artisan config:cache`.
2. `php artisan route:clear` (the storage-route and department-route middleware
   changed) then optionally `route:cache`.
3. Restart the actual PHP backend runtime (php-fpm / the PM2-managed process).
4. Restart any long-running workers (queue workers, schedulers) so they pick up
   the new env and code.
5. Confirm `php artisan about` (or a health probe) shows `APP_ENV=production`,
   `APP_DEBUG=false`.

---

## 6. The neutralised agent migration — check production, repair by hand

The migration `2026_08_14_000000_ensure_agent_and_recruitment_permissions` is now
a no-op in code, but it **already ran on at least the local database** and may
have run on production, leaving broad grants and dual role assignments.

1. Check whether it ran on production (read-only):

   ```sql
   SELECT migration FROM migrations
   WHERE migration = '2026_08_14_000000_ensure_agent_and_recruitment_permissions';
   SELECT count(*) FROM authorization_role_assignments
   WHERE assignment_source = 'AGENT_PERMISSION_FIX';
   ```

2. **If it ran:** take a fresh database backup, then run the read-only audit and
   review it with a human before changing anything:

   ```
   php artisan authz:audit-agent-migration
   ```

   It reports (without writing anything or printing PII): the roles/users it
   touched, agents wrongly assigned Recruitment Manager, grants exceeding the
   agent-portal implications, DENY conflicts, and CSV/out-of-scope assignment
   scopes.

3. Repair the Permission Matrix **by hand** based on that review. There is no
   automatic corrective migration — the pre-existing DENY / not-assigned state it
   overwrote cannot be reconstructed reliably. Do not bulk-revoke without the
   human-reviewed baseline.

---

## 7. Keep shadow mode until cohort audits are clean

Authorization stays in fail-safe **shadow** (`AUTHZ_MODE=shadow`,
`AUTHZ_ENFORCED_PREFIXES=` empty; only `admin.authorization.*` / `admin.policy.*`
enforced). Do **not** switch to global enforcement here.

- To enable enforcement later, list migrated prefixes **explicitly** (e.g.
  `AUTHZ_ENFORCED_PREFIXES=self.,ui.`), roll out one namespace at a time, and
  confirm no cohort is locked out between steps. Deleting the empty env line does
  **not** re-enable the old built-in prefix list (fixed this release).
- Before any prefix goes live, materialise registry implications for existing
  roles that need them, e.g. the agent department-picker grant:

  ```
  php artisan authz:project-implied-codes --role=agent        # dry run
  php artisan authz:project-implied-codes --role=agent --apply
  ```

  Do **not** blanket-apply projections to every role.

---

## 8. Post-change verification

Run all of these after Section 5:

- **Login** succeeds (password and OTP paths).
- **One authenticated read** returns data (e.g. a payslip list for a test user).
- **Generic production errors**: force a 500 and confirm the response is a generic
  JSON error with **no** stack trace, SQL, or file paths.
- **Authorization traces**: `authorization_decision_logs` is being written for
  protected routes and shows expected ALLOW/DENY; no unexpected mass-deny.
- **Session revocation**: change a test user's password via admin reset, confirm
  that user's pre-existing token now returns 401 and a fresh login works.
- **Storage route**: a public profile image loads via `/storage/users/...`; a
  `/storage/candidate-documents/...` request (any casing) returns 404.
- **Department picker**: a tenant admin sees only their own companies' in-use
  departments.

---

## 9. Mobile app (separate release)

- Install the new dependency with Expo's supported installer (requires approval —
  it was **not** run by the engineer): `npx expo install expo-secure-store`.
- Set `EXPO_PUBLIC_API_URL=https://niss.pro/api` for release builds. Never build
  or distribute a release pointing at the `http://192.168.1.53:8000` LAN URL
  (cleartext HTTP is now permitted only in development).
- Run `npx expo export` (or an EAS build) to validate the bundle after the
  dependency is installed.

---

## Rollback

- Config/runtime: restore the previous `.env`, `config:cache`, restart.
- Authorization: re-adding `AUTHZ_MODE=shadow` (already the default) and clearing
  any enforced prefixes reverts to advisory mode.
- Secrets: keep the previous values available in the vault until the new ones are
  verified end-to-end; only then destroy the old ones.
