<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimHospital;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * `GET,POST,PUT,DELETE /hospitals`.
 *
 * "Delete" is a status flip to 'inactive', never a row delete — the plan is
 * explicit that inactive hospitals are retained so historical claims still
 * resolve the hospital they were treated at (no `softDeletes()` anywhere in
 * this module; see `MediclaimHospital`'s own docblock).
 */
class HospitalController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimHospital::query()->with('contacts');

        $actor = auth('api')->user();
        if ($actor && ! $actor->isSuperAdmin()) {
            $userCompany = $actor->company_code;
            $query->where(function ($q) use ($userCompany) {
                $q->whereNull('company_code')
                  ->orWhere('company_code', '')
                  ->orWhere('company_code', 'all')
                  ->orWhere('company_code', $userCompany);
            });
        } else {
            $this->applyCompanyScope($query, $request);
        }

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('city', 'like', "%{$search}%"));
        }

        return $this->ok($query->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->hospitalRules());

        $actor = auth('api')->user();
        $hospital = MediclaimHospital::create($data + [
            'status' => $data['status'] ?? 'active',
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
        ]);

        MediclaimActivityLogSupport::log($actor, 'HOSPITAL_CREATED', 'mediclaim_hospital', $hospital->id, null, $hospital->toArray(), 'Hospital created.', $hospital->company_code);

        return $this->ok($hospital->fresh(), 201);
    }

    public function update(Request $request, int $hospital): JsonResponse
    {
        $model = $this->scoped($request, $hospital);

        if (! $model) {
            return $this->missing('Hospital not found.');
        }

        $data = $request->validate($this->hospitalRules(true));

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->fill($data);
        $model->updated_by = $actor->id;
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'HOSPITAL_UPDATED', 'mediclaim_hospital', $model->id, $before, $model->fresh()->toArray(), 'Hospital updated.', $model->company_code);

        return $this->ok($model->fresh('contacts'));
    }

    public function destroy(Request $request, int $hospital): JsonResponse
    {
        $model = $this->scoped($request, $hospital);

        if (! $model) {
            return $this->missing('Hospital not found.');
        }

        $actor = auth('api')->user();
        $before = $model->toArray();

        $model->status = 'inactive';
        $model->active_to = $model->active_to ?? now()->toDateString();
        $model->updated_by = $actor->id;
        $model->save();

        MediclaimActivityLogSupport::log($actor, 'HOSPITAL_DEACTIVATED', 'mediclaim_hospital', $model->id, $before, $model->fresh()->toArray(), 'Hospital deactivated.', $model->company_code);

        return $this->ok(['id' => $model->id, 'status' => $model->status]);
    }

    private function hospitalRules(bool $update = false): array
    {
        $required = $update ? 'sometimes' : 'required';

        return [
            'company_code' => [$update ? 'sometimes' : 'required', 'string', 'max:60'],
            'name' => [$required, 'string', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'state' => ['sometimes', 'nullable', 'string', 'max:120'],
            'pincode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'google_maps_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'specialties' => ['sometimes', 'nullable', 'array'],
            'specialties.*' => ['string', 'max:100'],
            'is_cashless' => ['sometimes', 'boolean'],
            'active_from' => ['sometimes', 'nullable', 'date'],
            'active_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:active_from'],
            'status' => ['sometimes', Rule::in(MediclaimHospital::STATUSES)],
        ];
    }

    private function scoped(Request $request, int $id): ?MediclaimHospital
    {
        $query = MediclaimHospital::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
