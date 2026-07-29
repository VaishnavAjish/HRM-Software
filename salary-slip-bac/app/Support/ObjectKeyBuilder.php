<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * The only place S3 object keys are constructed.
 *
 * Controllers must never assemble keys themselves — every segment goes through
 * sanitisation here so traversal, separators, control characters and Unicode
 * ambiguity cannot reach the bucket.
 */
class ObjectKeyBuilder
{
    public const OWNER_PREFIXES = [
        'user'     => 'users',
        'employee' => 'employees',
        'vendor'   => 'vendors',
        'customer' => 'customers',
        'project'  => 'projects',
        'contract' => 'contracts',
    ];

    public const TEMP_PREFIX       = 'temp';
    public const QUARANTINE_PREFIX = 'quarantine';
    public const ARCHIVE_PREFIX    = 'archive';

    private const MAX_SEGMENT_LENGTH = 100;
    private const MAX_KEY_LENGTH     = 1024; // S3 hard limit

    /**
     * Reduce one path segment to [A-Za-z0-9._-].
     *
     * Rejects rather than silently repairs when nothing usable survives, so a
     * hostile identifier cannot collapse into an empty segment and shift the
     * rest of the key up a level.
     */
    public static function sanitiseSegment(?string $value, string $label = 'segment'): string
    {
        $value = (string) $value;

        // Strip control characters (including NUL) and normalise separators.
        $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value);
        $value = str_replace(['\\', '/'], '_', $value);

        // Anything outside the safe set becomes an underscore; collapse runs.
        $value = preg_replace('/[^A-Za-z0-9._-]+/u', '_', $value);
        $value = preg_replace('/_{2,}/', '_', (string) $value);
        $value = trim((string) $value, '._-');

        // "." and ".." can only be traversal attempts once separators are gone.
        if ($value === '' || $value === '.' || $value === '..') {
            throw new InvalidArgumentException("Invalid {$label} for storage key.");
        }

        return substr($value, 0, self::MAX_SEGMENT_LENGTH);
    }

    public static function ownerPrefix(string $ownerType): string
    {
        $key = strtolower(trim($ownerType));

        if (!isset(self::OWNER_PREFIXES[$key])) {
            throw new InvalidArgumentException("Unsupported owner type: {$ownerType}");
        }

        return self::OWNER_PREFIXES[$key];
    }

    /**
     * employees/EMP1025/PAN_CARD/EMP1025_Rohit_PAN_CARD_V1_20260729154530.pdf
     */
    public static function build(
        string $ownerType,
        string $ownerRef,
        string $documentType,
        string $fileName
    ): string {
        $key = implode('/', [
            self::ownerPrefix($ownerType),
            self::sanitiseSegment($ownerRef, 'owner reference'),
            self::sanitiseSegment($documentType, 'document type'),
            self::sanitiseSegment($fileName, 'file name'),
        ]);

        return self::assertSafe($key);
    }

    public static function archiveKey(string $objectKey): string
    {
        return self::assertSafe(self::ARCHIVE_PREFIX . '/' . ltrim($objectKey, '/'));
    }

    public static function quarantineKey(string $objectKey): string
    {
        return self::assertSafe(self::QUARANTINE_PREFIX . '/' . ltrim($objectKey, '/'));
    }

    /** Final gate — nothing reaches S3 without passing this. */
    public static function assertSafe(string $key): string
    {
        if ($key === '' || strlen($key) > self::MAX_KEY_LENGTH) {
            throw new InvalidArgumentException('Storage key length is out of range.');
        }

        if (str_contains($key, '..') || str_contains($key, '//') || str_contains($key, '\\')) {
            throw new InvalidArgumentException('Storage key contains an illegal path sequence.');
        }

        if (str_starts_with($key, '/') || preg_match('/[\x00-\x1F\x7F]/u', $key)) {
            throw new InvalidArgumentException('Storage key contains an illegal character.');
        }

        foreach (explode('/', $key) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                throw new InvalidArgumentException('Storage key contains an empty or relative segment.');
            }
        }

        return $key;
    }
}
