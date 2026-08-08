<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;

/**
 * What a ticket attachment is allowed to be.
 *
 * Kept apart from the controller because these are security rules, not request
 * plumbing, and they are the kind of thing that gets quietly widened later.
 *
 * Two separate checks on purpose:
 *  - an allow-list of MIME types, which is what the request claims;
 *  - a deny-list of extensions, which is what the filesystem and any future
 *    web server will act on. A file called invoice.pdf.php with a declared
 *    type of application/pdf passes the first and is caught by the second.
 *
 * SVG is excluded even though it is an image: it can carry script, and an
 * inline-rendered SVG is stored XSS against whoever opens the ticket.
 */
class TicketAttachmentPolicy
{
    public const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

    public const MAX_FILES = 5;

    /** MIME types employees may attach to describe a problem. */
    public const ALLOWED_MIME = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
        'application/pdf',
        'text/plain', 'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'video/mp4', 'video/webm', 'video/quicktime',
        'application/zip',
    ];

    /** Never accepted, whatever the declared MIME type says. */
    public const BLOCKED_EXTENSIONS = [
        'php', 'phtml', 'phar', 'exe', 'msi', 'bat', 'cmd', 'com', 'sh', 'bash',
        'js', 'mjs', 'jar', 'html', 'htm', 'svg', 'xhtml', 'dll', 'so', 'ps1', 'vbs',
    ];

    /**
     * Only these are safe to render in the browser. Everything else downloads,
     * so a PDF or HTML-ish payload cannot execute in the app's origin.
     */
    public const INLINE_MIME = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    ];

    /** Null when acceptable, otherwise the reason to show the user. */
    public static function reject(UploadedFile $file): ?string
    {
        if (! $file->isValid()) {
            return 'The file did not upload correctly. Please try again.';
        }

        if ($file->getSize() > self::MAX_BYTES) {
            return sprintf(
                '"%s" is %s; the limit is %d MB.',
                $file->getClientOriginalName(),
                self::humanSize($file->getSize()),
                self::MAX_BYTES / 1024 / 1024
            );
        }

        $extension = strtolower($file->getClientOriginalExtension());

        if (in_array($extension, self::BLOCKED_EXTENSIONS, true)) {
            return sprintf('"%s" is a file type that cannot be attached.', $file->getClientOriginalName());
        }

        // getMimeType() sniffs the contents rather than trusting the browser's
        // Content-Type header, so a renamed executable is judged on what it is.
        if (! in_array($file->getMimeType(), self::ALLOWED_MIME, true)) {
            return sprintf(
                '"%s" is not a supported file type. Attach an image, PDF, document, spreadsheet or video.',
                $file->getClientOriginalName()
            );
        }

        return null;
    }

    public static function isInline(?string $mime): bool
    {
        return in_array($mime, self::INLINE_MIME, true);
    }

    /**
     * A stored name that cannot escape its folder or collide.
     *
     * The original name is kept in the database for display only — using it on
     * disk is how "../../.env" and overwritten files happen.
     */
    public static function storedName(UploadedFile $file): string
    {
        $extension = preg_replace('/[^a-z0-9]/', '', strtolower($file->getClientOriginalExtension()));

        return \Illuminate\Support\Str::uuid().($extension ? ".{$extension}" : '');
    }

    /** Trimmed, path-stripped original name, safe to store and display. */
    public static function displayName(UploadedFile $file): string
    {
        $name = basename($file->getClientOriginalName());
        $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name);

        return mb_substr(trim($name) ?: 'attachment', 0, 200);
    }

    public static function humanSize(?int $bytes): string
    {
        $bytes = (int) $bytes;

        if ($bytes >= 1048576) {
            return round($bytes / 1048576, 1).' MB';
        }

        return max(1, (int) round($bytes / 1024)).' KB';
    }
}
