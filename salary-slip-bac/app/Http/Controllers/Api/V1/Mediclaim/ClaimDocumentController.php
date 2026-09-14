<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Exceptions\DocumentException;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\User;
use App\Services\Documents\DocumentAuthorizer;
use App\Services\Documents\DocumentService;
use App\Support\DocumentType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * `GET,POST /claims/{claim}/documents`.
 *
 * Per the plan's reconciliation #4: claim documents are real
 * `Document`/`DocumentVersion` rows (created through the existing
 * `DocumentService` — nothing bespoke reinvented here), associated to their
 * claim through the new polymorphic `mediclaim_document_links` table. `index()`
 * returns items shaped like the existing `documentV1Api`'s list response
 * (`{documentId, documentType, documentLabel, version, currentVersion,
 * status, actions:{view,download,replace,delete}}`) so the already-built
 * `DocumentViewerModal.jsx` needs zero special-casing.
 *
 * Authorization: `DocumentAuthorizer` now carries a dedicated branch
 * (`canViewViaMediclaimClaim()`) that resolves a claim document's access
 * through this same `mediclaim_document_links` row and the linked claim's
 * `MediclaimClaim::awaitingReviewBy()`/manager-with-ack rules — so the SAME
 * check governs both this controller's `index()`/`store()` AND the generic
 * `documentV1Api.viewUrl`/`downloadUrl` endpoints (`Api\V1\DocumentController`)
 * called directly against a claim document's `document_id`. There is
 * deliberately no separate, possibly-divergent auth logic here.
 */
class ClaimDocumentController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        $links = MediclaimDocumentLink::query()
            ->where('linkable_type', MediclaimClaim::class)
            ->where('linkable_id', $model->id)
            ->with(['document.currentVersionRecord'])
            ->orderByDesc('id')
            ->get();

        return $this->ok($links->map(fn (MediclaimDocumentLink $link) => $this->presentLink($link, $actor))->values());
    }

    public function store(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        $data = $request->validate([
            'file' => ['required', 'file'],
            'document_type' => ['required', 'string'],
            'document_role' => ['sometimes', 'nullable', 'string', 'max:60'],
        ]);

        if (! DocumentType::isValid($data['document_type'])) {
            throw ValidationException::withMessages(['document_type' => 'Unknown document type.']);
        }

        try {
            /** @var User $owner */
            $owner = $model->employee ?: $actor;

            $version = DocumentService::make()->upload(
                $request->file('file'),
                $owner,
                $data['document_type'],
                $actor->id,
                $request->header('Idempotency-Key'),
                // Scoped per CLAIM: two different claims uploading the same
                // document-type slug (e.g. both have a HOSPITAL_BILL) never
                // collide into one Document, while the SAME claim
                // replacing/re-uploading the same slug still versions
                // correctly within that claim (see DocumentService's
                // reserveVersion()/upload() docblocks).
                scopeKey: sprintf('mediclaim_claim_document:%d', $model->id)
            );

            $link = MediclaimDocumentLink::create([
                'document_id' => $version->document_id,
                'linkable_type' => MediclaimClaim::class,
                'linkable_id' => $model->id,
                'document_role' => $data['document_role'] ?? $data['document_type'],
                'created_by' => $actor->id,
            ]);

            return $this->ok($this->presentLink($link->fresh(['document.currentVersionRecord']), $actor), 201);
        } catch (DocumentException $e) {
            return response()->json([
                'success' => false,
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->status);
        }
    }

    private function presentLink(MediclaimDocumentLink $link, ?User $actor): array
    {
        /** @var Document|null $document */
        $document = $link->document;
        /** @var DocumentVersion|null $current */
        $current = $document?->currentVersionRecord;

        return [
            'linkId' => $link->id,
            'documentId' => $document?->id,
            'documentType' => $document?->document_type,
            'documentLabel' => $document?->document_label,
            'documentRole' => $link->document_role,
            'version' => $document?->current_version,
            'status' => $document?->status,
            'currentVersion' => $current ? [
                'versionId' => $current->id,
                'version' => $current->version,
                'fileName' => $current->generated_file_name,
                'originalFileName' => $current->original_file_name,
                'mimeType' => $current->mime_type,
                'fileSize' => $current->file_size,
                'uploadStatus' => $current->upload_status,
                'scanStatus' => $current->scan_status,
                'uploadedAt' => optional($current->uploaded_at)->toIso8601String(),
            ] : null,
            'actions' => $document
                ? DocumentAuthorizer::actionsFor($actor, $document)
                : ['view' => false, 'download' => false, 'replace' => false, 'delete' => false, 'restore' => false],
        ];
    }
}
