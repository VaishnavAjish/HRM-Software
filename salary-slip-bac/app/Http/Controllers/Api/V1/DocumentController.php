<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DocumentException;
use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\User;
use App\Services\Documents\DocumentAudit;
use App\Services\Documents\DocumentAuthorizer as Auth;
use App\Services\Documents\DocumentService;
use App\Support\AadhaarReference;
use App\Support\DocumentType;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Throwable;

/**
 * Document API. Controllers stay thin: no AWS calls and no business rules —
 * those live in DocumentService, DocumentAuthorizer and the storage provider.
 */
class DocumentController extends Controller
{
    private const SORTABLE = ['uploaded_at', 'created_at', 'document_type', 'current_version', 'status'];

    private function requestId(): string
    {
        return request()->header('X-Request-Id') ?: (string) Str::uuid();
    }

    private function ok($data, int $status = 200)
    {
        return response()->json(['success' => true, 'data' => $data, 'meta' => ['requestId' => $this->requestId()]], $status);
    }

    private function fail(DocumentException $e)
    {
        return response()->json($e->toArray($this->requestId()), $e->status);
    }

    public function types()
    {
        $types = [];

        foreach (DocumentType::CATEGORIES as $category => $items) {
            foreach ($items as $slug => $label) {
                $types[] = ['category' => $category, 'value' => $slug, 'label' => $label];
            }
        }

        return $this->ok([
            'types'              => $types,
            'maxFileSizeBytes'   => (int) config('documents.max_file_size'),
            'allowedMimeTypes'   => config('documents.allowed_mime_types'),
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'file'          => 'required|file',
            'documentType'  => 'required|string',
            'employeeId'    => 'nullable|integer|exists:users,id',
            'description'   => 'nullable|string|max:1000',
        ]);

        try {
            $actor = auth('api')->user();
            $owner = $request->filled('employeeId') ? User::find($request->input('employeeId')) : $actor;

            if (!$owner) {
                throw DocumentException::notFound('Employee not found.');
            }

            Auth::authorize(Auth::canAccessOwner($actor, $owner), Auth::CREATE);

            $version = DocumentService::make()->upload(
                $request->file('file'),
                $owner,
                $request->input('documentType'),
                $actor?->id,
                $request->header('Idempotency-Key') ?: $request->input('idempotencyKey'),
                $request->input('description')
            );

            return $this->ok($this->presentVersion($version->document, $version), 201);
        } catch (DocumentException $e) {
            return $this->fail($e);
        } catch (Throwable $e) {
            report($e);

            return $this->fail(new DocumentException(
                DocumentException::UPLOAD_FAILED, 'The upload could not be completed.', 500
            ));
        }
    }

    /**
     * POST /v1/appointments/{appointmentId}/documents
     *
     * The Aadhaar number is read from the appointment record, never from the
     * request — a browser-supplied number would let a caller write into another
     * person's folder. It is used only to derive the HMAC storage reference and
     * is not echoed back in any form.
     */
    public function storeForAppointment(Request $request, int $appointmentId)
    {
        $request->validate([
            'file'         => 'required|file',
            'documentType' => 'required|string',
        ]);

        try {
            $appointment = User::find($appointmentId);

            if (!$appointment) {
                throw new DocumentException(
                    DocumentException::APPOINTMENT_NOT_FOUND,
                    'Appointment details were not found.',
                    404
                );
            }

            $actor = auth('api')->user();

            if (!Auth::canAccessOwner($actor, $appointment)) {
                DocumentAudit::denied(Auth::CREATE);

                throw new DocumentException(
                    DocumentException::APPOINTMENT_ACCESS_DENIED,
                    'You do not have access to this appointment.',
                    403
                );
            }

            // Trusted source of truth: the appointment's own stored number.
            $aadhaar = $appointment->aadhaar_secure_reference
                ? null
                : ($appointment->getRawOriginal('aadhar_card_no') ?? null);

            if (!$appointment->aadhaar_secure_reference) {
                if (!$aadhaar) {
                    throw new DocumentException(
                        DocumentException::APPOINTMENT_AADHAAR_MISSING,
                        'A valid Aadhaar number is required in Appointment Details before uploading documents.',
                        422
                    );
                }

                if (!AadhaarReference::isValid($aadhaar)) {
                    // The number itself is deliberately absent from the message.
                    throw new DocumentException(
                        DocumentException::APPOINTMENT_AADHAAR_INVALID,
                        'The Aadhaar number stored in the appointment is invalid.',
                        422
                    );
                }
            }

            $version = DocumentService::make()->upload(
                $request->file('file'),
                $appointment,
                $request->input('documentType'),
                $actor?->id,
                $request->header('Idempotency-Key')
            );

            return $this->ok($this->presentVersion($version->document, $version), 201);
        } catch (DocumentException $e) {
            return $this->fail($e);
        } catch (Throwable $e) {
            report($e);

            return $this->fail(new DocumentException(
                DocumentException::UPLOAD_FAILED, 'The upload could not be completed.', 500
            ));
        }
    }

    /** Metadata only — no presigned URL is generated per row. */
    public function index(Request $request)
    {
        $actor = auth('api')->user();

        $query = Document::query()
            ->with(['owner:id,name,emp_code,company_code,unit', 'currentVersionRecord'])
            ->when(!$request->boolean('includeDeleted'), fn ($q) => $q->visible());

        if (!Auth::isSuperAdmin($actor)) {
            // Non-super-admins are scoped to what they may see, in SQL — not
            // filtered afterwards in PHP.
            $query->where(function ($q) use ($actor) {
                $q->where('user_id', $actor?->id);

                if ((int) $actor?->role === 1) {
                    $q->orWhere('organization_code', $actor->company_code);
                } elseif ((int) $actor?->role === 2) {
                    $q->orWhereHas('owner', fn ($o) => $o
                        ->where('company_code', $actor->company_code)
                        ->where('unit', $actor->unit));
                }
            });
        }

        foreach (['employeeId' => 'user_id', 'ownerType' => 'owner_type', 'status' => 'status'] as $param => $column) {
            if ($request->filled($param)) {
                $query->where($column, $request->query($param));
            }
        }

        if ($request->filled('documentType')) {
            $query->whereIn('document_type', explode(',', $request->query('documentType')));
        }

        if ($request->filled('search')) {
            $search = $request->query('search');
            $query->where(fn ($q) => $q
                ->where('owner_ref', 'like', "%{$search}%")
                ->orWhere('document_type', 'like', "%{$search}%")
                ->orWhereHas('versions', fn ($v) => $v
                    ->where('original_file_name', 'like', "%{$search}%")
                    ->orWhere('generated_file_name', 'like', "%{$search}%")));
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->query('from'));
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->query('to'));
        }

        $sortBy = in_array($request->query('sortBy'), self::SORTABLE, true) ? $request->query('sortBy') : 'created_at';
        $sortOrder = strtolower((string) $request->query('sortOrder')) === 'asc' ? 'asc' : 'desc';

        $page = $query->orderBy($sortBy, $sortOrder)
            ->paginate(min((int) $request->query('pageSize', 25), 100));

        return $this->ok([
            'items'      => collect($page->items())->map(fn ($d) => $this->presentDocument($d, $actor))->all(),
            'page'       => $page->currentPage(),
            'pageSize'   => $page->perPage(),
            'total'      => $page->total(),
            'totalPages' => $page->lastPage(),
        ]);
    }

    public function show(Request $request, int $id)
    {
        try {
            [$document, $actor] = $this->findAuthorized($id);
            $current = $document->versions()->where('version', $document->current_version)->first();

            $payload = $this->presentDocument($document, $actor);
            $payload['versionCount'] = $document->versions()->count();

            if ($current && $document->isReadable()) {
                $service = DocumentService::make();
                $view = $service->viewUrl($document, $current);
                $payload['viewUrl'] = $view['url'];
                $payload['viewUrlExpiresAt'] = $view['expiresAt'];
            }

            return $this->ok($payload);
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    public function versions(Request $request, int $id)
    {
        try {
            [$document] = $this->findAuthorized($id);

            return $this->ok($document->versions->map(fn ($v) => $this->presentVersion($document, $v, false))->all());
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    public function viewUrl(Request $request, int $id)
    {
        return $this->issueUrl($request, $id, 'view');
    }

    public function downloadUrl(Request $request, int $id)
    {
        return $this->issueUrl($request, $id, 'download');
    }

    private function issueUrl(Request $request, int $id, string $kind)
    {
        try {
            [$document, $actor] = $this->findAuthorized($id);

            $version = $request->filled('versionId')
                ? $document->versions()->whereKey($request->input('versionId'))->first()
                : $document->versions()->where('version', $document->current_version)->first();

            if (!$version) {
                throw DocumentException::notFound('Document version not found.');
            }

            $service = DocumentService::make();
            $result = $kind === 'download'
                ? $service->downloadUrl($document, $version)
                : $service->viewUrl($document, $version);

            return $this->ok($result);
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    /** Replace = a brand new version; the previous object is never touched. */
    public function replace(Request $request, int $id)
    {
        $request->validate(['file' => 'required|file']);

        try {
            [$document, $actor] = $this->findAuthorized($id);
            Auth::authorize(Auth::canReplace($actor, $document), Auth::REPLACE, $document);

            $owner = $document->owner ?: $actor;
            $version = DocumentService::make()->upload(
                $request->file('file'),
                $owner,
                $document->document_type,
                $actor?->id,
                $request->header('Idempotency-Key')
            );

            DocumentAudit::record(DocumentAudit::DOCUMENT_REPLACED, $document, $version, [
                'version' => $version->version,
            ]);

            return $this->ok($this->presentVersion($document->fresh(), $version), 201);
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    public function destroy(Request $request, int $id)
    {
        try {
            [$document, $actor] = $this->findAuthorized($id);
            Auth::authorize(Auth::canDelete($actor, $document), Auth::DELETE, $document);

            DocumentService::make()->delete($document, $actor?->id);

            return $this->ok(['id' => $document->id, 'status' => Document::STATUS_DELETED]);
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    public function restore(Request $request, int $id)
    {
        try {
            $document = Document::find($id);

            if (!$document) {
                throw DocumentException::notFound();
            }

            $actor = auth('api')->user();
            Auth::authorize(Auth::canRestore($actor, $document), Auth::RESTORE, $document);

            DocumentService::make()->restore($document, $actor?->id);

            return $this->ok($this->presentDocument($document->fresh(), $actor));
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    public function health()
    {
        return $this->ok([
            'provider' => config('documents.provider'),
            'storage'  => DocumentService::provider()->healthy() ? 'ok' : 'unavailable',
        ]);
    }

    /** @return array{0:Document,1:?User} */
    private function findAuthorized(int $id): array
    {
        $document = Document::with(['owner', 'versions'])->find($id);

        if (!$document) {
            throw DocumentException::notFound();
        }

        $actor = auth('api')->user();
        Auth::authorize(Auth::canView($actor, $document), Auth::READ, $document);

        return [$document, $actor];
    }

    private function presentDocument(Document $document, ?User $actor): array
    {
        $current = $document->relationLoaded('currentVersionRecord')
            ? $document->currentVersionRecord
            : $document->versions()->where('version', $document->current_version)->first();

        return [
            'documentId'    => $document->id,
            'documentType'  => $document->document_type,
            'documentLabel' => $document->document_label,
            'status'        => $document->status,
            'version'       => $document->current_version,
            'isDeleted'     => (bool) $document->is_deleted,
            'owner'         => $document->owner ? [
                'id'      => $document->owner->id,
                'name'    => $document->owner->name,
                'empCode' => $document->owner->emp_code,
            ] : ['ref' => $document->owner_ref],
            'currentVersion' => $current ? $this->presentVersion($document, $current, false) : null,
            'createdAt'      => optional($document->created_at)->toIso8601String(),
            'actions'        => Auth::actionsFor($actor, $document),
        ];
    }

    /** s3_object_key/bucket are $hidden on the model and never surface here. */
    private function presentVersion(Document $document, DocumentVersion $version, bool $withDocument = true): array
    {
        $payload = [
            'versionId'        => $version->id,
            'version'          => $version->version,
            'fileName'         => $version->generated_file_name,
            'originalFileName' => $version->original_file_name,
            'mimeType'         => $version->mime_type,
            'fileSize'         => $version->file_size,
            'checksum'         => $version->checksum,
            'uploadStatus'     => $version->upload_status,
            'scanStatus'       => $version->scan_status,
            'uploadedAt'       => optional($version->uploaded_at)->toIso8601String(),
            'uploadedBy'       => $version->uploaded_by,
        ];

        if ($withDocument) {
            $payload['documentId']   = $document->id;
            $payload['documentType'] = $document->document_type;
            $payload['status']       = $document->status;
        }

        return $payload;
    }
}
