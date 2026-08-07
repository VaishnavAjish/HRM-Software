<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('/', function () {
    return view('welcome');
});

/**
 * Universal file streamer for storage assets (candidate resumes, document uploads, avatars, etc.)
 * Serves files directly with inline disposition and cross-origin framing permission headers.
 */
Route::get('/storage/{path}', function ($path) {
    $cleanPath = ltrim(str_replace('..', '', $path), '/');

    // Try public disk first
    if (Storage::disk('public')->exists($cleanPath)) {
        $fullPath = Storage::disk('public')->path($cleanPath);
        $mimeType = Storage::disk('public')->mimeType($cleanPath) ?: 'application/pdf';

        return response()->file($fullPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . basename($cleanPath) . '"',
            'Access-Control-Allow-Origin' => '*',
            'X-Frame-Options' => 'ALLOWALL',
        ]);
    }

    // Try default storage disk
    if (Storage::exists($cleanPath)) {
        $fullPath = Storage::path($cleanPath);
        $mimeType = Storage::mimeType($cleanPath) ?: 'application/pdf';

        return response()->file($fullPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . basename($cleanPath) . '"',
            'Access-Control-Allow-Origin' => '*',
            'X-Frame-Options' => 'ALLOWALL',
        ]);
    }

    // Direct path fallback in storage/app/public
    $localPublicPath = storage_path('app/public/' . $cleanPath);
    if (file_exists($localPublicPath)) {
        $mimeType = mime_content_type($localPublicPath) ?: 'application/pdf';
        return response()->file($localPublicPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . basename($cleanPath) . '"',
            'Access-Control-Allow-Origin' => '*',
            'X-Frame-Options' => 'ALLOWALL',
        ]);
    }

    // Direct path fallback in storage/app
    $localPath = storage_path('app/' . $cleanPath);
    if (file_exists($localPath)) {
        $mimeType = mime_content_type($localPath) ?: 'application/pdf';
        return response()->file($localPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . basename($cleanPath) . '"',
            'Access-Control-Allow-Origin' => '*',
            'X-Frame-Options' => 'ALLOWALL',
        ]);
    }

    return response()->json(['status' => false, 'message' => 'Document or resume file not found'], 404);
})->where('path', '.*');
