<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

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
 * Hospitals are ONE shared directory, not scoped per company (2026-09-22, at
 * the user's explicit direction — a hospital isn't "owned" by a company;
 * every employee across every company should see the same list). Earlier
 * this endpoint scoped hospitals per employee `company_code`, which — on top
 * of a since-fixed matching bug — meant the same hospital could be
 * "deactivated" for one company and still active for another, so two
 * employees at different companies saw different lists for no real business
 * reason. `company_code` stays on the row (the column is still `NOT NULL`)
 * purely for the audit trail; every hospital is always stored and read as
 * `all-companies`, and no request may set it to anything else.
 *
 * "Delete" is a genuine row delete (2026-09-22, at the user's explicit
 * request — previously just flipped `status` to `inactive`).
 * `mediclaim_claims.hospital_id` / `mediclaim_intimations.hospital_id` are
 * both `nullOnDelete()`, so a historical claim/intimation pointing at a
 * deleted hospital simply loses that reference rather than blocking the
 * delete. `mediclaim_hospital_contacts` and `mediclaim_policy_hospitals`
 * DO cascade-delete with the hospital, by design.
 */
class HospitalController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimHospital::query()->with('contacts');

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
        $data['company_code'] = 'all-companies';

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
        $model = MediclaimHospital::find($hospital);

        if (! $model) {
            return $this->missing('Hospital not found.');
        }

        $data = $request->validate($this->hospitalRules(true));
        unset($data['company_code']); // hospitals are shared network-wide, not per-company — see class docblock

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
        $model = MediclaimHospital::find($hospital);

        if (! $model) {
            return $this->missing('Hospital not found.');
        }

        $actor = auth('api')->user();
        $before = $model->toArray();
        $name = $model->name;
        $id = $model->id;

        $model->delete();

        MediclaimActivityLogSupport::log($actor, 'HOSPITAL_DELETED', 'mediclaim_hospital', $id, $before, null, "Hospital \"{$name}\" permanently deleted.", $before['company_code'] ?? null);

        return $this->ok(['id' => $id, 'deleted' => true]);
    }

    private function hospitalRules(bool $update = false): array
    {
        $required = $update ? 'sometimes' : 'required';

        return [
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
}
