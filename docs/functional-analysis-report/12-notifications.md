# 13. Notification System

> **Status: in-progress / partially mocked feature.** Per `git status`, the entire notification subsystem on the frontend (`src/utils/socket.js`, `src/context/NotificationContext.jsx`, `src/components/notifications/**`) is **untracked/uncommitted**, and no backend `app/Notifications` classes or notification endpoints were found in the backend inventory. This section documents what exists in the current working tree as-is, flagged clearly as in-flight rather than a finished, production-verified feature.

## 13.1 Architecture as implemented

- **Transport:** `src/utils/socket.js`, a thin Socket.IO client wrapper (`getSocket(token)` lazily connects once as a module-level singleton; `subscribeSocketEvent`/`emitSocketEvent` provide pub/sub with a local `Map`-based fallback so subscriptions still register even before the socket connects).
- **Server URL:** `VITE_SOCKET_URL` env var, **falling back to a hardcoded LAN address** `http://192.168.1.53:8000` if unset — see [Bug & Issue Report](19-bugs-issues.md).
- **State store:** `NotificationContext.jsx` (416 lines) — holds notifications, announcements, employee target groups, and per-user notification preferences.
- **Data source:** `SEED_NOTIFICATIONS`, `INITIAL_GROUPS`, `INITIAL_PREFERENCES` are **hardcoded fixture arrays in the source**, not fetched from a confirmed live backend endpoint, persisted to/rehydrated from versioned `localStorage` keys (e.g. `hrms_enterprise_notifications_v3`). The versioned key naming suggests the shape has already changed at least twice during development.
- **Live events actually wired:** the context listens for real Socket.IO server events `notification:received` and `announcement:published`, plays a Web Audio chime, and can trigger a browser desktop `Notification` — i.e., the transport and client-side plumbing are real even though the seed data is not.

## 13.2 Triggers

Based on code and naming (not confirmed against a live backend event emitter, since no backend `app/Notifications`/broadcast code was found):
- New announcement published by HR (`AnnouncementsModal.jsx` → `createAnnouncement`)
- Generic `notification:received` server push (content/trigger source unconfirmed)

No confirmed triggers exist yet for domain events one would expect in an HRMS (e.g. "your leave was approved," "a ticket was replied to," "an interview was scheduled") — **Unable to determine from source code** whether these are planned or simply not yet wired to this notification layer. (Note: interview-scheduled, offer, OTP, and assessment-invite communications **do** exist, but travel via email — see [Third-Party Integrations](15-integrations.md) — not via this in-app notification system.)

## 13.3 Channels

| Channel | Status |
|---|---|
| In-app (bell + drawer) | Implemented (UI + local state), data currently fixture-seeded |
| Browser desktop notification | Implemented (`Notification` API), gated by user permission grant |
| Sound (Web Audio chime) | Implemented |
| Email | Separate system entirely — 4 Mailables (OTP, interview-scheduled, offer, assessment-invite), synchronous send, unrelated to `NotificationContext` |
| Push (mobile) | Not found |

## 13.4 Templates

No formal template engine for in-app notifications — content is plain fields on the fixture/seed objects (`title`, `body`, `category`, etc., inferred from the modal fields in `AnnouncementsModal.jsx`: title/content/category/priority/audience/target-group/scheduling/attachments). Email templates are Blade views: `emails.otp`, `emails.interview-scheduled`, `emails.offer-letter`, `emails.assessment-invite`.

## 13.5 Recipients

- **Announcements:** targeted by audience/employee-group, using groups managed in `EmployeeGroupsModal.jsx` (e.g. "HR Team," "IT Team" — seeded list).
- **Read receipts:** `AnnouncementReadReceiptsModal.jsx` shows per-employee acknowledgment status for a given announcement, implying an intended per-recipient tracking model, though the backing data is fixture-seeded in the current build.

## 13.6 Scheduling

`AnnouncementsModal.jsx` includes a scheduling field for announcements, but no backend job/scheduler exists anywhere in the codebase (confirmed in [System Architecture](01-architecture.md) — no `->withSchedule()`, no queued jobs) to actually deliver a scheduled announcement at a future time. **This is a UI affordance with no confirmed backend fulfillment mechanism** — flagged, not guessed at further.

## 13.7 Priority

`AnnouncementsModal.jsx` includes a priority field (values not fully enumerated in this pass); ticket priority (a related but separate concept) is governed by `components/tickets/ticketMeta.js`'s `PRIORITY_ORDER`/`priorityMeta` (low/medium/high/urgent/critical).

## 13.8 Failure Handling

- Socket connection failures degrade gracefully to the local `Map`-based pub/sub fallback rather than throwing.
- Email sends are **synchronous and unqueued** — a failure sending, e.g., an offer letter would surface as an error in the same request that released the offer, rather than being retried in the background (see [Performance Audit](18-performance-audit.md)).
- No dead-letter/retry mechanism exists for either channel.

## 13.9 Recommendation

Before presenting this subsystem as a shipped feature in any external-facing documentation (client docs, registration filing), confirm with the engineering team whether a real backend notification-emitting endpoint exists or is planned — as read from source, this is currently a well-built client shell around fixture data plus a working but underused realtime transport.
