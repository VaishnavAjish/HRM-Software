<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimAdminActivityLog;
use App\Models\Mediclaim\MediclaimClaimEvent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Arr;

/**
 * `GET /audit` — reads `mediclaim_claim_events` (per-claim workflow
 * timeline) and `mediclaim_admin_activity_logs` (non-claim admin edits —
 * hospital/policy/rule-book/reviewer-assignment mutations, and report
 * exports as of B8), company-scoped via `ScopesCompany`, gated by
 * `permission:mediclaim.audit.read` at the route level (confirmed in
 * `routes/mediclaim.php`).
 *
 * `?type=`:
 *  - `claim` — only `mediclaim_claim_events`, DB-paginated (original B4 shape).
 *  - `admin` — only `mediclaim_admin_activity_logs`, DB-paginated (original B4 shape).
 *  - `all` (default, new in B8) — both sources normalized into one feed,
 *    sorted by `created_at` desc, and paginated. B4's version required the
 *    caller to already know which of the two tables to ask for; the plan
 *    calls for "a unified, filterable... audit feed", so `all` is now the
 *    default rather than something the caller has to opt into.
 *
 *    The merge happens in PHP rather than a SQL UNION: the two source
 *    tables have different columns/keys and Eloquent has no clean way to
 *    union two differently-shaped `Builder`s while keeping each side's own
 *    eager-loaded relations, and at this app's actual scale (two companies)
 *    that cost is negligible. Each side is capped at `mergeCap` (5000, well
 *    above any realistic per-request total) before sorting/paginating in
 *    memory, so a single request can't be made to load an unbounded table.
 *
 * Shared filters across every `type`: `actor_id`, `from`/`to` (date range on
 * `created_at`), `company_code`/`unit` (via `ScopesCompany`). `action` is a
 * unified alias for `event_type` (claim) / `activity_type` (admin) — the
 * original `activity_type`/`event_type` query params still work individually
 * for backward compatibility with B4's shape. `subject_id` filters
 * `claim_id` on the claim side and `subject_id` on the admin side;
 * `subject_type` filters the admin side only (claim events' subject is
 * always implicitly `mediclaim_claim`, so a `subject_type` filter for
 * anything else excludes claim-event rows from an `all`/`claim` request).
 */
class AuditController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    private const CLAIM_SUBJECT_TYPE = 'mediclaim_claim';

    public function index(Request $request): JsonResponse
    {
        $type = (string) ($request->query('type') ?: 'all');

        if ($type === 'admin') {
            return $this->ok($this->adminActivityQuery($request)->orderByDesc('id')->paginate($this->perPage($request)));
        }

        if ($type === 'claim') {
            return $this->ok($this->claimEventQuery($request)->orderByDesc('id')->paginate($this->perPage($request)));
        }

        return $this->ok($this->unifiedFeed($request));
    }

    private function adminActivityQuery(Request $request): Builder
    {
        $query = MediclaimAdminActivityLog::query()->with('actor:id,name,email');
        $this->applyCompanyScope($query, $request);

        if ($request->filled('activity_type')) {
            $query->where('activity_type', $request->query('activity_type'));
        } elseif ($request->filled('action')) {
            $query->where('activity_type', $request->query('action'));
        }

        if ($request->filled('actor_id')) {
            $query->where('actor_id', (int) $request->query('actor_id'));
        }

        if ($request->filled('subject_type')) {
            $query->where('subject_type', $request->query('subject_type'));
        }

        if ($request->filled('subject_id')) {
            $query->where('subject_id', (int) $request->query('subject_id'));
        }

        $this->applyDateRange($query, $request);

        return $query;
    }

    private function claimEventQuery(Request $request): Builder
    {
        // A subject_type filter that names something other than the claim
        // event's fixed implicit subject excludes every claim-event row.
        if ($request->filled('subject_type') && strtolower((string) $request->query('subject_type')) !== self::CLAIM_SUBJECT_TYPE) {
            return MediclaimClaimEvent::query()->whereRaw('1 = 0');
        }

        $query = MediclaimClaimEvent::query()
            ->with(['actor:id,name,email', 'claim:id,claim_number,company_code'])
            ->whereHas('claim', fn ($q) => $this->applyCompanyScope($q, $request));

        if ($request->filled('claim_id')) {
            $query->where('claim_id', (int) $request->query('claim_id'));
        } elseif ($request->filled('subject_id')) {
            $query->where('claim_id', (int) $request->query('subject_id'));
        }

        if ($request->filled('event_type')) {
            $query->where('event_type', $request->query('event_type'));
        } elseif ($request->filled('action')) {
            $query->where('event_type', $request->query('action'));
        }

        if ($request->filled('actor_id')) {
            $query->where('actor_id', (int) $request->query('actor_id'));
        }

        $this->applyDateRange($query, $request);

        return $query;
    }

    private function applyDateRange($query, Request $request): void
    {
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->query('from'));
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->query('to'));
        }
    }

    private function unifiedFeed(Request $request): LengthAwarePaginator
    {
        $perPage = $this->perPage($request);
        $page = max(1, (int) $request->query('page', 1));
        $mergeCap = 5000;

        $adminRows = $this->adminActivityQuery($request)->orderByDesc('created_at')->limit($mergeCap)->get()
            ->map(fn (MediclaimAdminActivityLog $row) => [
                'source' => 'admin',
                'id' => 'admin:'.$row->id,
                'actor' => $row->actor ? ['id' => $row->actor->id, 'name' => $row->actor->name, 'email' => $row->actor->email] : null,
                'action' => $row->activity_type,
                'subjectType' => $row->subject_type,
                'subjectId' => $row->subject_id,
                'description' => $row->description,
                'companyCode' => $row->company_code,
                'createdAt' => optional($row->created_at)->toIso8601String(),
                '_sort' => (string) $row->created_at,
            ]);

        $claimRows = $this->claimEventQuery($request)->orderByDesc('created_at')->limit($mergeCap)->get()
            ->map(fn (MediclaimClaimEvent $row) => [
                'source' => 'claim',
                'id' => 'claim:'.$row->id,
                'actor' => $row->actor ? ['id' => $row->actor->id, 'name' => $row->actor->name, 'email' => $row->actor->email] : null,
                'action' => $row->event_type,
                'subjectType' => self::CLAIM_SUBJECT_TYPE,
                'subjectId' => $row->claim_id,
                'description' => $row->description,
                'companyCode' => $row->claim?->company_code,
                'createdAt' => optional($row->created_at)->toIso8601String(),
                '_sort' => (string) $row->created_at,
            ]);

        $merged = $adminRows->concat($claimRows)
            ->sortByDesc('_sort')
            ->values()
            ->map(fn ($row) => Arr::except($row, ['_sort']));

        $total = $merged->count();
        $items = $merged->slice(($page - 1) * $perPage, $perPage)->values();

        return new LengthAwarePaginator($items, $total, $perPage, $page, [
            'path' => Paginator::resolveCurrentPath(),
            'query' => $request->query(),
        ]);
    }

    private function perPage(Request $request): int
    {
        return min((int) $request->query('per_page', 50), 200);
    }
}
