<?php

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
    $decoded = rawurldecode($path);

    // Reject NUL bytes, path traversal, absolute paths, drive letters and UNC.
    if (
        str_contains($decoded, "\0")
        || preg_match('#(^|[\\\\/])\.\.([\\\\/]|$)#', $decoded)
        || preg_match('#^([a-zA-Z]:|[\\\\/])#', $decoded)
    ) {
        abort(404);
    }

    $clean = ltrim(str_replace('\\', '/', $decoded), '/');

    // Sensitive subtrees that must never be served without authentication,
    // even though some physically live on the public disk today.
    $blockedPrefixes = ['candidate-documents/', 'documents/', 'private/', 'backups/', 'rbac-readiness/'];
    foreach ($blockedPrefixes as $blocked) {
        if ($clean === rtrim($blocked, '/') || str_starts_with($clean, $blocked)) {
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
