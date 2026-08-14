<?php

use App\Support\ObjectKeyBuilder;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('/', function () {
    return view('welcome');
});

/**
 * Public asset streamer.
 *
 * Serves ONLY the public disk (storage/app/public) and ONLY non-sensitive
 * subtrees. Private material — candidate resumes/ID documents, ticket
 * attachments, database backups, RBAC readiness dumps — is never reachable
 * here: those go through the authenticated v1/documents and candidate-resume
 * controllers (which enforce permission + company/object scope). Employee
 * profile photos (users/*) are the only asset the SPA loads by a bare
 * <img src> that cannot carry a bearer token, so that prefix stays servable.
 *
 * Previously this route also streamed the default (private) disk and raw
 * storage/app with an Access-Control-Allow-Origin:* / X-Frame-Options:ALLOWALL
 * response, which exposed every private file by direct URL to any origin.
 */
Route::get('/storage/{path}', function (string $path) {
    // Fully decode before any check. A single rawurldecode leaves a double-
    // encoded traversal (%252e%252e) intact, so decode until stable (bounded)
    // and normalise back-slashes to forward-slashes, so the traversal and
    // blocked-prefix checks below see the real target.
    $decoded = $path;
    for ($i = 0; $i < 3; $i++) {
        $next = rawurldecode($decoded);
        if ($next === $decoded) {
            break;
        }
        $decoded = $next;
    }

    // Reject NUL bytes, path traversal, absolute paths, drive letters and UNC.
    if (
        str_contains($decoded, "\0")
        || preg_match('#(^|[\\\\/])\.\.([\\\\/]|$)#', $decoded)
        || preg_match('#^([a-zA-Z]:|[\\\\/])#', $decoded)
    ) {
        abort(404);
    }

    $clean = ltrim(str_replace('\\', '/', $decoded), '/');

    // Sensitive subtrees that must never be served without authentication, even
    // though some physically live on the public disk today. Compared
    // case-insensitively: NTFS on the LAN host is case-insensitive, so
    // "CANDIDATE-DOCUMENTS/x" resolves to the same file the lowercase prefix
    // guards — the prefix list must not.
    $compare = strtolower($clean);
    $blockedPrefixes = ['candidate-documents/', 'documents/', 'private/', 'backups/', 'rbac-readiness/'];
    foreach ($blockedPrefixes as $blocked) {
        if ($compare === rtrim($blocked, '/') || str_starts_with($compare, $blocked)) {
            abort(404);
        }
    }

    if ($clean === '' || ! Storage::disk('public')->exists($clean)) {
        abort(404);
    }

    $absolute = Storage::disk('public')->path($clean);
    $mimeType = Storage::disk('public')->mimeType($clean) ?: 'application/octet-stream';

    return response()->file($absolute, [
        'Content-Type' => $mimeType,
        'Content-Disposition' => 'inline; filename="' . basename($clean) . '"',
        'X-Content-Type-Options' => 'nosniff',
        'Cache-Control' => 'private, max-age=300',
    ]);
})->where('path', '.*');

/**
 * Expiring signed URLs for locally stored v1 documents — the local-provider
 * counterpart of an S3 presigned link. Only URLs minted by
 * LocalStorageProvider::viewUrl/downloadUrl validate; everything else 403s.
 */
Route::get('/local-documents/{path}', function (string $path) {
    $decoded = rawurldecode($path);

    try {
        ObjectKeyBuilder::assertSafe($decoded);
    } catch (InvalidArgumentException) {
        abort(404);
    }

    $absolute = storage_path('app/private/uploads/' . $decoded);

    if (! is_file($absolute)) {
        $absolute = public_path('uploads/' . $decoded);
    }

    if (! is_file($absolute)) {
        abort(404);
    }

    $mimeType = @mime_content_type($absolute) ?: 'application/octet-stream';
    $download = request()->query('download');

    return response()->file($absolute, [
        'Content-Type' => $mimeType,
        'Content-Disposition' => ($download ? 'attachment' : 'inline')
            . '; filename="' . basename($download ?: $decoded) . '"',
        'X-Content-Type-Options' => 'nosniff',
        'Cache-Control' => 'private, no-store',
    ]);
})->where('path', '.*')->name('local-documents.view')->middleware('signed');
