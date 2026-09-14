<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimMemberChangeRequest;
use App\Services\Mediclaim\MediclaimMemberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * `GET /me/member-change-requests` (HR side) — HR approve/reject, calls
 * `MediclaimMemberService::decideChangeRequest()`.
 *
 * `mediclaim_member_change_requests` carries no `company_code` of its own
 * (only its enrollment does), so company scoping goes through
 * `whereHas('enrollment', ...)` rather than directly on the table — the same
 * `ScopesCompany::applyCompanyScope()` call, just nested one relation deep.
 */
class MemberChangeRequestController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function __construct(private readonly MediclaimMemberService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimMemberChangeRequest::query()
            ->with(['employee:id,name,email,emp_code', 'member', 'decidedBy:id,name,email'])
            ->whereHas('enrollment', fn ($q) => $this->applyCompanyScope($q, $request));

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function decide(Request $request, int $changeRequest): JsonResponse
    {
        $model = $this->scoped($request, $changeRequest);

        if (! $model) {
            return $this->missing('Member change request not found.');
        }

        $data = $request->validate([
            'decision' => ['required', Rule::in(['approve', 'reject'])],
            'remarks' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $actor = auth('api')->user();

        return $this->guarded(fn () => $this->ok(
            $this->service->decideChangeRequest($model, $actor, $data['decision'], $data['remarks'] ?? null)
        ));
    }

    private function scoped(Request $request, int $id): ?MediclaimMemberChangeRequest
    {
        $query = MediclaimMemberChangeRequest::query()->where('id', $id)
            ->whereHas('enrollment', fn ($q) => $this->applyCompanyScope($q, $request));

        return $query->first();
    }
}
