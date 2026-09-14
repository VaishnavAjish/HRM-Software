<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Services\Mediclaim\ReportingSubtreeResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /team/claims`, `GET /team/pending-approvals` — a manager's view of
 * their reporting subtree's claims.
 *
 * `index()` (broad visibility, "everyone under me") uses
 * `ReportingSubtreeResolver`'s live BFS — deliberately never used to
 * authorize a *decision*. `pending()` (the actionable queue) instead checks
 * `assigned_manager_id === actor.id` directly, the point-in-time snapshot
 * `ClaimWorkflowService::submit()` took — see
 * `ReportingSubtreeResolver`'s own docblock for why the two must not be
 * conflated: today's org chart is not necessarily who a claim was actually
 * routed to.
 */
class TeamClaimController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(private readonly ReportingSubtreeResolver $subtree)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();
        $subordinateIds = $this->subtree->subtreeUserIds((int) $actor->id, now());

        $query = MediclaimClaim::query()
            ->whereIn('employee_user_id', $subordinateIds === [] ? [0] : $subordinateIds)
            ->with(['employee:id,name,email,emp_code,designation', 'hospital']);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function pending(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $query = MediclaimClaim::query()
            ->where('assigned_manager_id', $actor->id)
            ->where('status', MediclaimClaim::STATUS_MANAGER_REVIEW)
            ->with(['employee:id,name,email,emp_code,designation', 'hospital', 'expenses']);

        return $this->ok($query->orderBy('submitted_at')->paginate(min((int) $request->query('per_page', 25), 100)));
    }
}
