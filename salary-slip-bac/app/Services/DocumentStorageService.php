<?php

namespace App\Services;

use App\Models\DocumentUpload;
use App\Models\User;
use App\Support\DocumentType;
use Illuminate\Http\UploadedFile;
use RuntimeException;

/**
 * Generates standardised filenames and stores uploaded documents.
 *
 * Naming:  <EmpCode>_<UserName>_<DOC_TYPE>_V<n>_<YYYYMMDDHHMMSS>.<ext>
 * Example: EMP1025_RohitSaket_PAN_CARD_V1_20260729154530.pdf
 * Path:    storage/app/private/uploads/users/<EmpCode>/<DOC_TYPE>/<filename>
 *          (never under public/ — identity documents must not be reachable
 *          without authentication; serving goes through DocumentController)
 *
 * Callers never choose the filename — that is the point of the feature. The
 * user's original name is preserved only as metadata on document_uploads.
 */
class DocumentStorageService
{
    public const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

    /** Extensions we are willing to serve back to a browser. */
    public const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'];

    public const ALLOWED_MIME_TYPES = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
    ];

    /**
     * Extensions that must never be accepted even if the MIME sniffs benign —
     * a file called invoice.php dropped under a web root is a live script.
     */
    public const BLOCKED_EXTENSIONS = [
        'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'phar',
        'exe', 'com', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'msi', 'scr',
        'dll', 'so', 'jar', 'js', 'mjs', 'vbs', 'wsf', 'hta', 'html', 'htm', 'svg',
    ];

    /**
     * Strip a value down to filename-safe characters.
     *
     * Removes punctuation, emoji and any non-ASCII, converts spaces to
     * underscores and collapses duplicates, per the naming rules.
     */
    public static function sanitiseSegment(?string $value, bool $stripUnderscores = false): string
    {
        $clean = preg_replace('/[^A-Za-z0-9]+/u', $stripUnderscores ? '' : '_', (string) $value);

        return trim((string) $clean, '_');
    }

    /** "Rohit  Saket!" -> "RohitSaket" (kept readable, no separators). */
    public static function sanitiseName(?string $name): string
    {
        $parts = preg_split('/\s+/', trim((string) $name)) ?: [];
        $clean = '';

        foreach ($parts as $part) {
            $clean .= ucfirst(strtolower(self::sanitiseSegment($part, true)));
        }

        return $clean !== '' ? $clean : 'User';
    }

    /** Falls back to the numeric id when the user has no employee code. */
    public static function ownerCode(?User $user): string
    {
        $code = self::sanitiseSegment($user->emp_code ?? '', true);

        if ($code !== '') {
            return strtoupper($code);
        }

        return $user && $user->id ? 'USR' . str_pad((string) $user->id, 6, '0', STR_PAD_LEFT) : 'USR000000';
    }

    /** Next version number for this user + document type. */
    public static function nextVersion(?int $userId, string $documentType): int
    {
        if (!$userId) {
            return 1;
        }

        return (int) DocumentUpload::where('user_id', $userId)
            ->where('document_type', $documentType)
            ->max('version') + 1;
    }

    /**
     * Build the filename that WOULD be used, without storing anything.
     * Powers the "Generated Filename:" preview in the upload form.
     */
    public static function previewName(
        ?User $user,
        string $documentType,
        string $originalName,
        ?int $version = null,
        ?string $timestamp = null
    ): string {
        $documentType = DocumentType::isValid($documentType) ? $documentType : DocumentType::normalise($documentType);
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) ?: 'dat';
        $version ??= self::nextVersion($user?->id, $documentType);
        $timestamp ??= now()->format('YmdHis');

        return sprintf(
            '%s_%s_%s_V%d_%s.%s',
            self::ownerCode($user),
            self::sanitiseName($user->name ?? null),
            $documentType,
            $version,
            $timestamp,
            $extension
        );
    }

    /**
     * Reject anything we are not willing to store.
     *
     * @throws RuntimeException with a message safe to show the user
     */
    public static function validate(UploadedFile $file): void
    {
        if (!$file->isValid()) {
            throw new RuntimeException('The file failed to upload or is corrupted.');
        }

        $size = $file->getSize();

        if ($size === false || $size === null || $size <= 0) {
            throw new RuntimeException('The file is empty.');
        }

        if ($size > self::MAX_BYTES) {
            throw new RuntimeException('The file is larger than ' . (self::MAX_BYTES / 1048576) . ' MB.');
        }

        $extension = strtolower($file->getClientOriginalExtension());

        if (in_array($extension, self::BLOCKED_EXTENSIONS, true)) {
            throw new RuntimeException('Executable and script files are not allowed.');
        }

        if (!in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            throw new RuntimeException('Unsupported file type. Allowed: ' . implode(', ', self::ALLOWED_EXTENSIONS) . '.');
        }

        // getMimeType() sniffs the actual contents rather than trusting the
        // client-supplied header, so a renamed executable is caught here.
        if (!in_array($file->getMimeType(), self::ALLOWED_MIME_TYPES, true)) {
            throw new RuntimeException('The file contents do not match an allowed document type.');
        }
    }

    /**
     * Validate, name, move and record an uploaded document.
     *
     * @return DocumentUpload the persisted metadata row
     * @throws RuntimeException on validation failure
     */
    public static function store(
        UploadedFile $file,
        ?User $owner,
        string $documentType,
        ?int $uploadedBy = null
    ): DocumentUpload {
        self::validate($file);

        $documentType = DocumentType::isValid($documentType)
            ? $documentType
            : DocumentType::normalise($documentType);

        $ownerCode = self::ownerCode($owner);
        $version = self::nextVersion($owner?->id, $documentType);
        $originalName = $file->getClientOriginalName();
        $extension = strtolower($file->getClientOriginalExtension()) ?: 'dat';
        $size = (int) $file->getSize();
        $mime = $file->getMimeType();

        // Hash before the move — afterwards the temp path is gone.
        $checksum = hash_file('sha256', $file->getPathname()) ?: null;

        $generatedName = self::previewName($owner, $documentType, $originalName, $version);
        $directory = 'uploads/users/' . $ownerCode . '/' . $documentType;

        $file->move(storage_path('app/private/' . $directory), $generatedName);

        return DocumentUpload::create([
            'user_id'           => $owner?->id,
            'emp_code'          => $owner->emp_code ?? null,
            'user_name'         => $owner->name ?? null,
            'document_type'     => $documentType,
            'document_category' => DocumentType::categoryOf($documentType),
            'original_name'     => $originalName,
            'generated_name'    => $generatedName,
            'storage_path'      => $directory . '/' . $generatedName,
            'extension'         => $extension,
            'mime_type'         => $mime,
            'size'              => $size,
            'checksum'          => $checksum,
            'version'           => $version,
            'uploaded_by'       => $uploadedBy,
            'uploaded_at'       => now(),
        ]);
    }
}
