# 16. Third-Party Integrations

## 16.1 Summary table — configured vs. actually integrated

| Service | Status | Purpose | Authentication | Used by | Failure handling |
|---|---|---|---|---|---|
| **PostgreSQL** | Required, enforced at boot | Primary datastore | DB credentials (env) | Entire backend | `AppServiceProvider::refuseUnsupportedDatabase()` refuses to boot on a non-pgsql connection |
| **AWS S3** (+ SSE-S3/SSE-KMS) | **Active** when `DOCUMENT_STORAGE_PROVIDER=s3` | Production document storage | AWS SDK default credential chain (IAM role in prod; explicit keys left blank by design) | `S3StorageProvider`, all document upload/view/download flows | `healthy()` does a `headBucket` check; multipart uploads abort and clean up orphaned parts on failure; a `documents:reconcile` Artisan command detects/repairs drift between DB and actual S3 objects |
| **JWT (tymon/jwt-auth)** | Active, primary API auth | Session tokens | `JWT_SECRET` (symmetric) | Nearly every protected route | Distinct 401 messages for expired/invalid/missing token |
| **Laravel Sanctum** | Installed, minimally used | Token auth | — | Exactly 1 route (`GET /user`) | N/A — flagged as an inconsistency, not a real integration |
| **SMTP / Postmark / Resend / SES** | Configured, defaults to `log` driver | Outbound email | Provider API keys/SMTP creds (blank in `.env.example`) | 4 Mailables: OTP, interview-scheduled, offer letter, assessment invite | No retry/queue — a failed send throws synchronously in the request that triggered it (no `ShouldQueue` on any Mailable) |
| **Google Forms + Apps Script** | **Active**, inbound webhook | Candidate intake relay — "the shared Google Form (relayed by its bound Apps Script)" per code comment | Shared secret token, `hash_equals` comparison | `PublicCandidateIntakeController` | Invalid/missing token → request rejected; no retry/dead-letter handling found |
| **Slack** | Config slot only | — | Bot OAuth token env vars defined in `config/services.php` | **No code calls it** | N/A — unused boilerplate |
| **Malware/AV scanning** | **Not implemented** | Would scan uploaded documents | — | `DOCUMENT_MALWARE_SCAN_ENABLED` flag defaults `false`; `scan_status` column exists on `document_versions` but nothing ever sets it beyond the default "not scanned" | No fallback — uploads are accepted without any AV pass currently |
| **SMS gateway** | **None found** | — | — | — | — |
| **Payment gateway** | **None found** | — | — | — | — |
| **AI / LLM API** | **None found** (see [AI Features](14-ai-features.md)) | — | — | — | — |
| **UIDAI / government e-KYC** | **None found** | Aadhaar handling is entirely internal storage/encryption/masking, not a live verification API | — | — | — |
| **Socket.IO** (self-hosted, not third-party) | Active transport, in-progress feature | Real-time notifications | Bearer token on connect | `NotificationContext.jsx` | Server URL falls back to a **hardcoded LAN IP** (`http://192.168.1.53:8000`) if `VITE_SOCKET_URL` is unset — see [Bug & Issue Report](19-bugs-issues.md) |

## 16.2 Frontend ↔ Backend linkage

`services.frontend_url` (`FRONTEND_URL` env var) is the backend's only awareness of the frontend's existence — used exclusively to build candidate-facing links embedded in hiring emails (e.g. `FRONTEND_URL + /quiz/{access_token}`), deliberately null-safe (an unset value omits the link rather than pointing at a wrong host). This confirms the two codebases are genuinely separate deployables communicating only over HTTP, with no shared session or server-side rendering.

## 16.3 CORS

`config/cors.php` allows all origins (`['*']`) by default, unless `CORS_HANDLED_BY_PROXY` is true (which defaults to true when `APP_ENV=production`) — in production, CORS is expected to be handled by an upstream edge proxy (a code comment names it "niss.pro's edge proxy") rather than by Laravel itself, specifically to avoid emitting a duplicate/invalid `*, *` header. `supports_credentials` is `false`. `.env.example` sets a local dev origin of `http://localhost:5173` (the Vite default port) via `CORS_ORIGIN`, though this specific variable was not confirmed to be read inside `cors.php` itself in this pass.

## 16.4 Mobile packaging (not a third-party service, but an integration point)

A Capacitor wrapper packages the same React codebase as native Android/iOS apps. `apiRequest()` in `utils/api.js` detects the Capacitor platform and switches from `fetch` to `CapacitorHttp.request()` specifically to avoid WebView CORS restrictions — i.e., the native app talks to the backend directly rather than through a bundled webview proxy.
