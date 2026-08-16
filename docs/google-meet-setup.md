# Google Meet integration setup

Interview scheduling can create real Google Calendar events with a Google
Meet link attached, invite the candidate and panelists as guests, and keep
the meeting time in sync on reschedule. It uses a **service account with
domain-wide delegation** — the backend never asks an HR user to sign in to
Google; it acts as one dedicated Workspace mailbox on their behalf.

Until this is set up, `meeting_link` on an interview just stays whatever HR
types in manually (unchanged behavior) — `InterviewController` checks
`GoogleMeetService::isConfigured()` before ever calling Google, so nothing
here is required for the rest of the app to work.

**Requirement:** this only works with **Google Workspace** (a paid
organization domain), not a personal `@gmail.com` account — domain-wide
delegation is a Workspace admin feature.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or reuse an existing one for this organization).
2. In **APIs & Services → Library**, search for **Google Calendar API** and click **Enable**.

## 2. Create a service account

1. **APIs & Services → Credentials → Create Credentials → Service account**.
2. Give it a name, e.g. `hrms-interview-scheduler`. No roles need to be granted at the project level — access comes from domain-wide delegation, not IAM.
3. Open the created service account → **Keys → Add key → Create new key → JSON**. This downloads a `.json` file — **treat it like a password**. It is the only credential needed to impersonate the mailbox in step 4.
4. Note the service account's **Client ID** (a long numeric string, shown on the service account's details page) — needed for step 3.

## 3. Authorize domain-wide delegation (Workspace admin)

1. Sign in to [admin.google.com](https://admin.google.com) as a super admin.
2. **Security → Access and data control → API controls → Domain-wide delegation → Add new**.
3. **Client ID**: the numeric client ID from step 2.4.
4. **OAuth scopes**: `https://www.googleapis.com/auth/calendar.events`
5. Save.

## 4. Pick the mailbox the service account impersonates

Decide which real Workspace mailbox interview events should be created
under — e.g. a shared `hiring@yourcompany.com` mailbox, or a specific HR
manager's account. All interviews will show that mailbox as the organizer;
candidates and panelists are still added as real guests and get real
Calendar invites regardless of whose calendar it's created on. A shared
mailbox is recommended so the integration doesn't break if that one person
leaves.

## 5. Install the credentials on the server

1. Upload the JSON key file from step 2.3 to the server, **outside the web root**, at:
   ```
   salary-slip-bac/storage/app/google/service-account.json
   ```
   (This path is already in `.gitignore` — never commit it.)
2. In `salary-slip-bac/.env`, set:
   ```
   GOOGLE_SERVICE_ACCOUNT_PATH=/absolute/path/to/salary-slip-bac/storage/app/google/service-account.json
   GOOGLE_CALENDAR_IMPERSONATE_EMAIL=hiring@yourcompany.com
   ```
3. Run `php artisan config:clear` so the new values are picked up.

## 6. Verify

Schedule a test interview with **Mode = Video** and no manual meeting link.
`InterviewController::store()` will attempt to create the Meet
automatically. Check the interview record's `meeting_status`:

| `meeting_status` | Meaning |
|---|---|
| `not_configured` | Steps above aren't complete yet — no error, just inert. |
| `created` | Real Google Meet created successfully. |
| `failed` | Google API call failed — see `meeting_error` and `storage/logs` for the `google_meet_sync_failed` warning. |
| `manual` | HR supplied their own link (Zoom, etc.) — Google was intentionally skipped. |
| `delete_failed` | The interview was cancelled but Google didn't confirm the Calendar event was removed — check manually. |

Common `failed` causes: domain-wide delegation not yet propagated (can take
a few minutes after step 3), wrong scope authorized, or
`GOOGLE_CALENDAR_IMPERSONATE_EMAIL` pointing at a mailbox that doesn't exist
in the Workspace domain.
