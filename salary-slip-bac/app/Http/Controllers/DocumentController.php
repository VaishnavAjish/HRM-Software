<?php

namespace App\Http\Controllers;

use App\Exceptions\DocumentException;
use App\Models\DocumentUpload;
use App\Models\User;
use App\Services\Documents\DocumentService;
use App\Services\DocumentStorageService;
use App\Support\AuditLogger;
use App\Support\DocumentType;
use Illuminate\Http\Request;
use RuntimeException;

class DocumentController extends Controller
{
    /** Catalogue for the upload form's Document Type selector. */
    public function types()
    {
        $categories = [];

        foreach (DocumentType::CATEGORIES as $category => $types) {
            foreach ($types as $slug => $label) {
                $categories[] = [
                    'category' => $category,
                    'value' => $slug,
                    'label' => $label,
                ];
            }
        }

        return response()->json([
            'status' => true,
            'data' => $categories,
            'meta' => [
                'max_bytes' => DocumentStorageService::MAX_BYTES,
                'allowed_extensions' => DocumentStorageService::ALLOWED_EXTENSIONS,
            ],
        ]);
    }

    /**
     * Filename this upload would receive, shown before the user confirms.
     * Purely informational — store() recomputes it, so nothing here is trusted.
     */
    public function previewName(Request $request)
    {
        $request->validate([
            'user_id' => 'nullable|integer|exists:users,id',
            'document_type' => 'required|string',
            'file_name' => 'required|string|max:255',
        ]);

        $owner = $this->resolveOwner($request);

        if (! $owner) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        // SECURITY FIX: Enforce actor's scope on document preview.
        if (! $this->canAccessOwner($owner)) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $type = DocumentType::isValid($request->document_type)
            ? $request->document_type
            : DocumentType::normalise($request->document_type);

        return response()->json([
            'status' => true,
            'data' => [
                'generated_name' => DocumentStorageService::previewName($owner, $type, $request->file_name),
                'document_type' => $type,
                'version' => DocumentStorageService::nextVersion($owner->id, $type),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'user_id' => 'nullable|integer|exists:users,id',
            'document_type' => 'required|string',
            'file' => 'required|file',
        ]);

        $owner = $this->resolveOwner($request);

        if (! $owner) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        // SECURITY FIX: Enforce actor's scope on document upload.
        if (! $this->canAccessOwner($owner)) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $type = DocumentType::isValid($request->document_type)
            ? $request->document_type
            : DocumentType::normalise($request->document_type);

        try {
            if (config('documents.provider') === 's3') {
                // Same S3 pipeline as /v1/documents, mapped back onto this
                // endpoint's original response shape so existing callers keep
                // working while everything lands in the bucket.
                $version = DocumentService::make()->upload(
                    $request->file('file'),
                    $owner,
                    $type,
                    optional(auth('api')->user())->id,
                    $request->header('Idempotency-Key')
                );

                $document = (object) [
                    'id' => $version->id,
                    'user_id' => $owner->id,
                    'emp_code' => $owner->emp_code,
                    'document_type' => $type,
                    'original_name' => $version->original_file_name,
                    'generated_name' => $version->generated_file_name,
                    'version' => $version->version,
                    'size' => $version->file_size,
                    'mime_type' => $version->mime_type,
                    'checksum' => $version->checksum,
                    'storage_path' => null, // private object — no direct path
                ];
            } else {
                $document = DocumentStorageService::store(
                    $request->file('file'),
                    $owner,
                    $type,
                    optional(auth('api')->user())->id
                );
            }
        } catch (DocumentException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], $e->status);
        } catch (RuntimeException $e) {
            return response()->json(['status' => false, 'message' => $e->getMessage()], 422);
        }

        // Who/when/IP/device come from AuditLogger; the rest is document detail.
        AuditLogger::log($request, 'UPLOAD', 'Documents', null, [
            'document_id' => $document->id,
            'user_id' => $document->user_id,
            'emp_code' => $document->emp_code,
            'document_type' => $document->document_type,
            'original_name' => $document->original_name,
            'generated_name' => $document->generated_name,
            'version' => $document->version,
            'size' => $document->size,
            'checksum' => $document->checksum,
        ]);

        return response()->json(['status' => true, 'message' => 'Document uploaded', 'data' => $document], 201);
    }

    /**
     * Search by employee code, name, document type, filename, version or an
     * upload-date range.
     */
    public function index(Request $request)
    {
        $query = DocumentUpload::query()->with('user:id,name,emp_code');

        // SECURITY FIX: Scope document list to actor's company/unit.
        $userAuth = auth('api')->user();
        if ($userAuth) {
            if ((int) $userAuth->role === 1) {
                $query->where('company_code', $userAuth->company_code);
            } elseif ((int) $userAuth->role === 2) {
                $query->where('company_code', $userAuth->company_code)
                    ->where('unit', $userAuth->unit);
            } elseif ((int) $userAuth->role === 4 || $userAuth->type === 'agent') {
                $query->where('added_by', $userAuth->id);
            } elseif ((int) $userAuth->role !== 0) {
                $query->whereRaw('1 = 0');
            }
        }

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('emp_code', 'like', "%{$search}%")
                    ->orWhere('user_name', 'like', "%{$search}%")
                    ->orWhere('original_name', 'like', "%{$search}%")
                    ->orWhere('generated_name', 'like', "%{$search}%");
            });
        }

        foreach (['user_id' => 'user_id', 'emp_code' => 'emp_code', 'version' => 'version'] as $param => $column) {
            if ($request->filled($param)) {
                $query->where($column, $request->query($param));
            }
        }

        if ($type = $request->query('document_type')) {
            $query->whereIn('document_type', explode(',', $type));
        }

        if ($category = $request->query('category')) {
            $query->where('document_category', $category);
        }

        if ($from = $request->query('from')) {
            $query->whereDate('uploaded_at', '>=', $from);
        }

        if ($to = $request->query('to')) {
            $query->whereDate('uploaded_at', '<=', $to);
        }

        // Default to the current version of each document; pass all_versions=1
        // to see the full history.
        if (! $request->boolean('all_versions')) {
            $query->latestVersions();
        }

        $documents = $query->orderByDesc('uploaded_at')
            ->paginate((int) $request->query('limit', 25));

        return response()->json([
            'status' => true,
            'data' => $documents->items(),
            'meta' => [
                'total' => $documents->total(),
                'page' => $documents->currentPage(),
                'limit' => $documents->perPage(),
                'totalPages' => $documents->lastPage(),
            ],
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $document = DocumentUpload::find($id);

        if (! $document) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }

        // SECURITY FIX: Enforce actor's scope on document delete.
        $owner = User::find($document->user_id);
        if (! $owner || ! $this->canAccessOwner($owner)) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }

        $absolute = $document->storage_path ? $this->resolveStoredFile($document->storage_path) : null;

        if ($absolute) {
            @unlink($absolute);
        }

        AuditLogger::log($request, 'DELETE', 'Documents', [
            'document_id' => $document->id,
            'generated_name' => $document->generated_name,
            'document_type' => $document->document_type,
            'emp_code' => $document->emp_code,
        ], null);

        $document->delete();

        return response()->json(['status' => true, 'message' => 'Document deleted']);
    }

    public function file(Request $request, int $id)
    {
        $document = DocumentUpload::find($id);

        if (! $document || ! $document->storage_path) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }

        $owner = User::find($document->user_id);
        if (! $owner || ! $this->canAccessOwner($owner)) {
            return response()->json(['status' => false, 'message' => 'Document not found'], 404);
        }

        $absolute = $this->resolveStoredFile($document->storage_path);

        if (! $absolute) {
            return response()->json(['status' => false, 'message' => 'File missing from storage'], 404);
        }

        AuditLogger::log($request, 'VIEW', 'Documents', null, [
            'document_id' => $document->id,
            'generated_name' => $document->generated_name,
            'document_type' => $document->document_type,
            'emp_code' => $document->emp_code,
        ]);

        return response()->file($absolute, [
            'Content-Type' => $document->mime_type ?: 'application/octet-stream',
            'Content-Disposition' => 'inline; filename="' . basename($document->generated_name ?: 'document') . '"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    private function resolveStoredFile(string $relative): ?string
    {
        $relative = ltrim(str_replace('\\', '/', $relative), '/');

        if ($relative === '' || str_contains($relative, "\0") || preg_match('#(^|/)\.\.(/|$)#', $relative)) {
            return null;
        }

        foreach ([storage_path('app/private/' . $relative), public_path($relative)] as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /** Target employee: explicit user_id/emp_code, else the caller themselves. */
    private function resolveOwner(Request $request): ?User
    {
        if ($request->filled('user_id')) {
            return User::find($request->input('user_id'));
        }

        if ($request->filled('emp_code')) {
            return User::where('emp_code', $request->input('emp_code'))->first();
        }

        return auth('api')->user();
    }

    /**
     * SECURITY FIX: Check if the authenticated user can access the given owner.
     * Mirrors the scoping logic in UserController::inManagedScope.
     */
    private function canAccessOwner(User $owner): bool
    {
        $userAuth = auth('api')->user();
        if (! $userAuth) {
            return false;
        }
        if ((int) $userAuth->role === 0) {
            return true;
        }
        if ((int) $userAuth->role === 1) {
            return $owner->company_code === $userAuth->company_code;
        }
        if ((int) $userAuth->role === 2) {
            return $owner->company_code === $userAuth->company_code
                && $owner->unit === $userAuth->unit;
        }
        if ((int) $userAuth->role === 4 || $userAuth->type === 'agent') {
            return $owner->added_by === $userAuth->id;
        }

        return false;
    }
}
