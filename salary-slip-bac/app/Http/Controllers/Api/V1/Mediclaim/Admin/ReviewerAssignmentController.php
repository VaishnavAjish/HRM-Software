<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimReviewerAssignment;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * `GET,POST /reviewer-assignments` — primary/backup reviewer per
 * company/policy/role. `MediclaimClaim::scopeAwaitingReviewBy()` resolves a
 * reviewer's queue and decide-eligibility straight from the `active` rows
 * this endpoint manages (see its docblock), and `mediclaim_ready`
 * (B5's `ModuleAvailabilityController` extension) stays false until at
 * least one active, non-backup row exists per required role per company —
 * so getting these rows right here is what actually turns the feature on.
 */
class ReviewerAssignmentController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimReviewerAssignment::query()->with(['user:id,name,email', 'policy:id,policy_code,name']);
        $this->applyCompanyScope($query, $request);

        if ($request->filled('role')) {
            $query->where('role', $request->query('role'));
        }

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return $this->ok($query->orderBy('role')->orderBy('is_backup')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_code' => ['required', 'string', 'max:60'],
            'policy_id' => ['sometimes', 'nullable', 'integer', 'exists:mediclaim_policies,id'],
            'role' => ['required', Rule::in(MediclaimReviewerAssignment::ROLES)],
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'is_backup' => ['sometimes', 'boolean'],
            'active_from' => ['sometimes', 'nullable', 'date'],
            'active_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:active_from'],
            'status' => ['sometimes', Rule::in(MediclaimReviewerAssignment::STATUSES)],
        ]);

        $actor = auth('api')->user();

        $assignment = MediclaimReviewerAssignment::create($data + [
            'is_backup' => $data['is_backup'] ?? false,
            'status' => $data['status'] ?? 'active',
        ]);

        MediclaimActivityLogSupport::log($actor, 'REVIEWER_ASSIGNMENT_CREATED', 'mediclaim_reviewer_assignment', $assignment->id, null, $assignment->toArray(), 'Reviewer assignment created.', $assignment->company_code);

        return $this->ok($assignment->fresh(['user:id,name,email', 'policy:id,policy_code,name']), 201);
    }

    public function update(Request $request, int $assignment): JsonResponse
    {
        $model = $this->scoped($request, $assignment);

        if (! $model) {
            return $this->missing('Reviewer assignment not found.');
        }

        $data = $request->validate([
            'is_backup' => ['sometimes', 'boolean'],
            'active_to' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(MediclaimReviewerAssignment::STATUSES)],
        ]);

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->fill($data);
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'REVIEWER_ASSIGNMENT_UPDATED', 'mediclaim_reviewer_assignment', $model->id, $before, $model->fresh()->toArray(), 'Reviewer assignment updated.', $model->company_code);

        return $this->ok($model->fresh(['user:id,name,email', 'policy:id,policy_code,name']));
    }

    private function scoped(Request $request, int $id): ?MediclaimReviewerAssignment
    {
        $query = MediclaimReviewerAssignment::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
