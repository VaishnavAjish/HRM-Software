<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * `GET,POST,PUT /policies`, `POST /policies/{policy}/versions/{version}/publish`.
 *
 * `store()` creates the policy AND its first (draft) `MediclaimPolicyVersion`
 * in one transaction, since a policy with no version is not yet usable by
 * anything (`PolicyEligibilityService` reads everything from a version's
 * `rules` JSON). `storeVersion()` is an addition beyond the plan's literal
 * table (which lists only `publish`, not creating a version in the first
 * place) — without it, no policy could ever get a SECOND version, making the
 * whole "effective-dated, versioned rules" design (and the `publish` action
 * itself) a dead end after the auto-created v1. Flagged in the B4 handoff
 * report.
 */
class PolicyController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimPolicy::query()->with('versions');
        $this->applyCompanyScope($query, $request);

        return $this->ok($query->orderBy('company_code')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_code' => ['required', 'string', 'max:60'],
            'policy_code' => ['required', 'string', 'max:60', 'unique:mediclaim_policies,policy_code'],
            'name' => ['required', 'string', 'max:255'],
            'insurer_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(MediclaimPolicy::STATUSES)],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'rules' => ['sometimes', 'array'],
            'effective_from' => ['sometimes', 'nullable', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        $actor = auth('api')->user();

        $policy = DB::transaction(function () use ($data, $actor) {
            $policy = MediclaimPolicy::create([
                'company_code' => $data['company_code'],
                'policy_code' => $data['policy_code'],
                'name' => $data['name'],
                'insurer_name' => $data['insurer_name'] ?? null,
                'status' => $data['status'] ?? 'draft',
                'description' => $data['description'] ?? null,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);

            $policy->versions()->create([
                'version_number' => 1,
                'status' => 'draft',
                'rules' => $data['rules'] ?? [],
                'effective_from' => $data['effective_from'] ?? now()->toDateString(),
                'effective_to' => $data['effective_to'] ?? null,
                'created_by' => $actor->id,
            ]);

            MediclaimActivityLogSupport::log($actor, 'POLICY_CREATED', 'mediclaim_policy', $policy->id, null, $policy->toArray(), 'Policy created.', $policy->company_code);

            return $policy;
        });

        return $this->ok($policy->fresh('versions'), 201);
    }

    public function update(Request $request, int $policy): JsonResponse
    {
        $model = $this->scoped($request, $policy);

        if (! $model) {
            return $this->missing('Policy not found.');
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'insurer_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(MediclaimPolicy::STATUSES)],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->fill($data);
        $model->updated_by = $actor->id;
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'POLICY_UPDATED', 'mediclaim_policy', $model->id, $before, $model->fresh()->toArray(), 'Policy updated.', $model->company_code);

        return $this->ok($model->fresh('versions'));
    }

    public function storeVersion(Request $request, int $policy): JsonResponse
    {
        $model = $this->scoped($request, $policy);

        if (! $model) {
            return $this->missing('Policy not found.');
        }

        $data = $request->validate([
            'rules' => ['required', 'array'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        $actor = auth('api')->user();

        $version = DB::transaction(function () use ($model, $data, $actor) {
            $nextNumber = ((int) $model->versions()->max('version_number')) + 1;

            $version = $model->versions()->create([
                'version_number' => $nextNumber,
                'status' => 'draft',
                'rules' => $data['rules'],
                'effective_from' => $data['effective_from'],
                'effective_to' => $data['effective_to'] ?? null,
                'created_by' => $actor->id,
            ]);

            MediclaimActivityLogSupport::log($actor, 'POLICY_VERSION_CREATED', 'mediclaim_policy_version', $version->id, null, $version->toArray(), 'Draft policy version created.', $model->company_code);

            return $version;
        });

        return $this->ok($version, 201);
    }

    public function publishVersion(Request $request, int $policy, int $version): JsonResponse
    {
        $policyModel = $this->scoped($request, $policy);

        if (! $policyModel) {
            return $this->missing('Policy not found.');
        }

        $model = MediclaimPolicyVersion::query()->where('policy_id', $policyModel->id)->find($version);

        if (! $model) {
            return $this->missing('Policy version not found.');
        }

        if ($model->status === 'archived') {
            throw ValidationException::withMessages(['status' => 'An archived policy version cannot be published.']);
        }

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->status = 'active';
        $model->published_at = now();
        $model->published_by = $actor->id;
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'POLICY_VERSION_PUBLISHED', 'mediclaim_policy_version', $model->id, $before, $model->fresh()->toArray(), 'Policy version published.', $policyModel->company_code);

        return $this->ok($model->fresh());
    }

    private function scoped(Request $request, int $id): ?MediclaimPolicy
    {
        $query = MediclaimPolicy::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
