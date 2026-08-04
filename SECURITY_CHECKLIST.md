# Security Remediation Checklist — Deploy-Time Secrets Rotation

This checklist covers the **operational** security items that must be completed
by an admin **before/at deployment**. Unlike the code fixes (which are shipped in
this repo), these items touch live credentials and infrastructure and can only be
performed by whoever controls the AWS account and mail provider.

> Everything below is manual. Do not commit rotated values to the repo. `.env`
> is not tracked; changes there are local/deploy-secret only.

---

## 1. Turn off debug mode (HIGH)

`APP_DEBUG=true` in `salary-slip-bac/.env` exposes stack traces, env vars, and
SQL queries to any user or attacker hitting an error page. It must be `false` in
every non-local environment.

- File: `salary-slip-bac/.env`
- Change: `APP_DEBUG=false` (keep `APP_ENV` whatever it currently is; debug is the
  critical flag)
- Verify: restart the worker/queue (e.g. `php artisan config:clear` /
  `php artisan config:cache`) and load a failing URL — you must see a generic
  500 page, **not** a stack trace.

## 2. Rotate AWS credentials (CRITICAL)

The S3 access key lives in plaintext in `.env`:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` / `AWS_DEFAULT_REGION`
- `AWS_S3_BUCKET`
- `AWS_S3_ENCRYPTION`
- `AWS_CA_BUNDLE` (if pointing at a private CA, confirm the bundle path is still valid)

Since the key was stored in a repository working copy, **treat it as compromised**:

1. In the AWS console → IAM → identify the access key (the one that starts with
   `AKIA...`).
2. **Create a new key**, wire it into `.env`, and confirm the app can still list
   and write objects in the S3 bucket.
3. **Deactivate, then delete** the old key.
4. For a service/EC2/container workload, prefer an IAM **role** with a temporary
   credential (assigned via the instance/lambda/container role) instead of a long
   lived user key. If the app supports it, remove the static access key entirely.
5. Confirm the curl/CA bundle path is reachable so TLS to S3 does not start
   failing after the credential change (see `AWS_CA_BUNDLE`).

## 3. Rotate the mail/SMTP password (CRITICAL)

`MAIL_PASSWORD` (with `MAIL_HOST` / `MAIL_USERNAME`) is stored in plaintext in
`.env` and was present in a repo copy.

- Rotate the SMTP/application password in the mail provider's dashboard.
- Update `MAIL_PASSWORD` in `.env`; verify a password-reset / mail-sending path
  still works.
- Confirm `MAIL_ENCRYPTION` / `MAIL_PORT` still match the provider's current
  requirements (e.g. STARTTLS vs SSL).

## 4. Rotate the database password (HIGH)

`DB_USERNAME` / `DB_PASSWORD` (against `DB_HOST`) are in plaintext in `.env`.

- Set a new strong password in the DB engine.
- Update `.env` and re-run `php artisan config:cache`.
- Confirm connections work from the web + queue workers.

## 5. Handle the private key `HRM.pem` (CRITICAL)

`F:\HRMS oldd\HRM.pem` sits at the repo root. Although `*.pem` is already in
`.gitignore`, a private SSH/cloud key should not live in a source tree at all.

1. **Remove** `HRM.pem` from the working copy (and any deployed server that does
   not need it).
2. If it is an SSH private key, verify it is not used by any automation; if it is
   in use, rotate it the same way you would any leaked credential.
3. After deletion, confirm no git object references it (`git log --all --oneline
   -- HRM.pem`) — if it was ever committed, it is in history and must be treated
   as leaked and rotated, not just deleted.

## 6. Confirm CORS policy (DEV-ONLY review)

`config/cors.php` honors `CORS_HANDLED_BY_PROXY`. Any wildcard/allowed-origins
value in `.env` (via the `CORS_*` variables) is intended for local development
only.

- In production, set the `allowed_origins` to the actual deployed front-end
  origin(s), and let a reverse proxy (or the app) enforce them.
- Do not leave a `*` for credentialed (JWT) requests in production.

## 7. Additional application secrets

- `AADHAAR_REFERENCE_SECRET` is used for the Aadhaar reference hashing. Rotate it
  deliberately **only** if you also re-derive/repopulate any stored
  references, otherwise existing records break. This is lower priority than the
  network-facing credentials above and should be planned with a migration.
- `APP_KEY` is derived from the Laravel app key; if `APP_KEY` ever leaked it must
  be regenerated with `php artisan key:generate` (regenerating invalidates all
  signed URLs and sessions).

---

## Suggested order of operations

1. Disable `APP_DEBUG` (fast, no downtime).
2. Rotate SMTP password.
3. Rotate DB password.
4. Remove + rotate `HRM.pem`.
5. Rotate AWS key (and migrate to an IAM role if possible).
6. Tighten CORS for production.
7. Plan (with migration) any rotation of `AADHAAR_REFERENCE_SECRET`.

After each credential change, redeploy and verify end-to-end (login, forgot
password/SMTP, S3 file upload/download, DB reads) before moving to the next
item.