<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimDocumentRequirement;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

/**
 * `GET,POST /document-requirements`, `PUT,DELETE /document-requirements/{id}`
 * — HR's control over the claim document checklist (which types exist,
 * which are required, and each one's max upload size), replacing the
 * previously hardcoded `CLAIM_DOCUMENT_CHECKLIST` constant. `index()` is
 * read by both this admin screen and the employee-facing document
 * checklist (see the migration's docblock on why `.read` is shared rather
 * than split into an admin/self pair).
 *
 * `destroy()` is a soft "retire" (`is_active = false`), never a hard
 * delete — an already-submitted claim's document links reference a
 * `document_type` string, not a foreign key to this table, so nothing
 * breaks either way, but keeping the row (inactive) preserves the label
 * for any historical claim still showing it in `MediclaimClaimFormPdfService`.
 *
 * `mediclaim_document_requirements` is deliberately NOT in
 * `RequireModuleSchema::MODULES['mediclaim']` — that check runs ahead of
 * every Mediclaim route, so a table added there must exist before ANY
 * Mediclaim feature works, not just this one, on a deployment that hasn't
 * migrated yet. Every action here guards for the table's absence itself
 * instead, in exactly the same shape `RequireModuleSchema` uses
 * (`MODULE_SCHEMA_NOT_READY`, 503) — so a not-yet-migrated deployment
 * reports "being set up" only for this screen, and every other already-working
 * Mediclaim feature is unaffected either way.
 */
class DocumentRequirementController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        if (! Schema::hasTable('mediclaim_document_requirements')) {
            return $this->notReady();
        }

        // Self-heals an environment where the seeding migration never
        // reached this database — see ensureDefaultsSeeded()'s docblock.
        // This is the single endpoint both the admin Settings screen and
        // the employee-facing DocumentChecklist read, so bootstrapping here
        // covers both.
        MediclaimDocumentRequirement::ensureDefaultsSeeded();

        $query = MediclaimDocumentRequirement::query();

        if (! $request->boolean('includeInactive') && ! $request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        return $this->ok($query->orderBy('sort_order')->orderBy('id')->get());
    }

    public function store(Request $request): JsonResponse
    {
        if (! Schema::hasTable('mediclaim_document_requirements')) {
            return $this->notReady();
        }

        $data = $request->validate($this->rules());

        $actor = auth('api')->user();
        $row = MediclaimDocumentRequirement::create($data + [
            'is_required' => $data['is_required'] ?? true,
            'max_file_size_kb' => $data['max_file_size_kb'] ?? 5120,
            'sort_order' => $data['sort_order'] ?? ((int) MediclaimDocumentRequirement::max('sort_order') + 1),
            'is_active' => $data['is_active'] ?? true,
        ]);

        MediclaimActivityLogSupport::log($actor, 'DOCUMENT_REQUIREMENT_CREATED', 'mediclaim_document_requirement', $row->id, null, $row->toArray(), 'Document requirement created.');

        return $this->ok($row, 201);
    }

    public function update(Request $request, int $requirement): JsonResponse
    {
        if (! Schema::hasTable('mediclaim_document_requirements')) {
            return $this->notReady();
        }

        $row = MediclaimDocumentRequirement::find($requirement);
        if (! $row) {
            return $this->missing('Document requirement not found.');
        }

        $rules = $this->rules(update: true, ignoreId: $row->id);
        $data = $request->validate($rules);

        $actor = auth('api')->user();
        $before = $row->toArray();
        $row->fill($data);
        $row->save();

        MediclaimActivityLogSupport::log($actor, 'DOCUMENT_REQUIREMENT_UPDATED', 'mediclaim_document_requirement', $row->id, $before, $row->fresh()->toArray(), 'Document requirement updated.');

        return $this->ok($row->fresh());
    }

    public function destroy(Request $request, int $requirement): JsonResponse
    {
        if (! Schema::hasTable('mediclaim_document_requirements')) {
            return $this->notReady();
        }

        $row = MediclaimDocumentRequirement::find($requirement);
        if (! $row) {
            return $this->missing('Document requirement not found.');
        }

        $actor = auth('api')->user();
        $before = $row->toArray();
        $row->is_active = false;
        $row->save();

        MediclaimActivityLogSupport::log($actor, 'DOCUMENT_REQUIREMENT_RETIRED', 'mediclaim_document_requirement', $row->id, $before, $row->fresh()->toArray(), 'Document requirement retired.');

        return $this->ok($row->fresh());
    }

    /** Same shape/status `RequireModuleSchema` returns for the module-wide check. */
    private function notReady(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => [
                'code' => 'MODULE_SCHEMA_NOT_READY',
                'message' => 'Document requirements have not been set up on this server yet.',
                'module' => 'mediclaim_document_requirements',
            ],
        ], 503);
    }

    private function rules(bool $update = false, ?int $ignoreId = null): array
    {
        $required = $update ? 'sometimes' : 'required';

        return [
            'document_type' => [
                $required, 'string', 'max:100', 'regex:/^[A-Z0-9_]+$/',
                Rule::unique('mediclaim_document_requirements', 'document_type')->ignore($ignoreId),
            ],
            'label' => [$required, 'string', 'max:150'],
            'is_required' => ['sometimes', 'boolean'],
            'conditional_rule' => ['sometimes', 'nullable', Rule::in(MediclaimDocumentRequirement::CONDITIONAL_RULES)],
            'max_file_size_kb' => ['sometimes', 'integer', 'min:64', 'max:51200'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
