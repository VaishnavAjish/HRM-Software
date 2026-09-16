<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimHospital;
use App\Models\Mediclaim\MediclaimHospitalContact;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * `POST /hospitals/{hospital}/contacts`, `POST /hospitals/{hospital}/contacts/{contact}`,
 * `DELETE /hospitals/{hospital}/contacts/{contact}` — the "concern person"
 * for a hospital (name, designation, phone, email, photo). Update uses POST
 * rather than PUT so an optional photo replacement can ride along as a
 * normal multipart request — the same reason `ClaimDocumentController`'s
 * upload endpoint is POST-only.
 *
 * Contacts are a genuinely deletable sub-resource (unlike the hospital
 * itself): nothing else references a contact row by id, so there's no
 * "historical claim needs to resolve this" reason to retain one after
 * removal — `destroy()` hard-deletes, and removes the stored photo file
 * with it.
 *
 * Photo storage mirrors `AuthController::verifyEmployeeIdentity()`'s plain
 * `store($dir, 'public')` pattern rather than the heavier
 * `DocumentService`/`DocumentUpload` system used for claim attachments —
 * a contact headshot has no authorization/versioning/claim-linkage need,
 * it's just an avatar.
 */
class HospitalContactController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    private const PHOTO_DISK = 'public';
    private const PHOTO_DIR = 'mediclaim-hospital-contacts';

    public function store(Request $request, int $hospital): JsonResponse
    {
        $hospitalModel = $this->scopedHospital($request, $hospital);

        if (! $hospitalModel) {
            return $this->missing('Hospital not found.');
        }

        $data = $request->validate($this->contactRules());
        $data['hospital_id'] = $hospitalModel->id;

        if ($request->hasFile('photo')) {
            $data['photo'] = $request->file('photo')->store(self::PHOTO_DIR, self::PHOTO_DISK);
        }

        $contact = MediclaimHospitalContact::create($data);

        $actor = auth('api')->user();
        MediclaimActivityLogSupport::log($actor, 'HOSPITAL_CONTACT_CREATED', 'mediclaim_hospital_contact', $contact->id, null, $contact->toArray(), 'Hospital contact added.', $hospitalModel->company_code);

        return $this->ok($hospitalModel->fresh('contacts'), 201);
    }

    public function update(Request $request, int $hospital, int $contact): JsonResponse
    {
        $hospitalModel = $this->scopedHospital($request, $hospital);

        if (! $hospitalModel) {
            return $this->missing('Hospital not found.');
        }

        $model = MediclaimHospitalContact::query()->where('hospital_id', $hospitalModel->id)->where('id', $contact)->first();

        if (! $model) {
            return $this->missing('Hospital contact not found.');
        }

        $data = $request->validate($this->contactRules(true));
        $before = $model->toArray();

        if ($request->hasFile('photo')) {
            $oldPhoto = $model->photo;
            $data['photo'] = $request->file('photo')->store(self::PHOTO_DIR, self::PHOTO_DISK);
            if ($oldPhoto) {
                Storage::disk(self::PHOTO_DISK)->delete($oldPhoto);
            }
        }

        $model->fill($data);
        $model->save();

        $actor = auth('api')->user();
        MediclaimActivityLogSupport::log($actor, 'HOSPITAL_CONTACT_UPDATED', 'mediclaim_hospital_contact', $model->id, $before, $model->fresh()->toArray(), 'Hospital contact updated.', $hospitalModel->company_code);

        return $this->ok($hospitalModel->fresh('contacts'));
    }

    public function destroy(Request $request, int $hospital, int $contact): JsonResponse
    {
        $hospitalModel = $this->scopedHospital($request, $hospital);

        if (! $hospitalModel) {
            return $this->missing('Hospital not found.');
        }

        $model = MediclaimHospitalContact::query()->where('hospital_id', $hospitalModel->id)->where('id', $contact)->first();

        if (! $model) {
            return $this->missing('Hospital contact not found.');
        }

        $before = $model->toArray();
        $photo = $model->photo;
        $model->delete();

        if ($photo) {
            Storage::disk(self::PHOTO_DISK)->delete($photo);
        }

        $actor = auth('api')->user();
        MediclaimActivityLogSupport::log($actor, 'HOSPITAL_CONTACT_DELETED', 'mediclaim_hospital_contact', $contact, $before, null, 'Hospital contact removed.', $hospitalModel->company_code);

        return $this->ok($hospitalModel->fresh('contacts'));
    }

    private function contactRules(bool $update = false): array
    {
        $required = $update ? 'sometimes' : 'required';

        return [
            'name' => [$required, 'string', 'max:150'],
            'designation' => ['sometimes', 'nullable', 'string', 'max:150'],
            'phone' => [$required, 'string', 'max:30'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'availability' => ['sometimes', 'nullable', 'string', 'max:150'],
            'escalation_priority' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
            'photo' => ['sometimes', 'nullable', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ];
    }

    private function scopedHospital(Request $request, int $id): ?MediclaimHospital
    {
        $query = MediclaimHospital::query()->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }
}
