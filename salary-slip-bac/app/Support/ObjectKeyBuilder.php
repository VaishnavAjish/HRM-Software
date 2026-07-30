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
        'appointment' => 'appointments',
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
     * One prefix per employee, with the employee ID at the top level:
     *
     *   EMP001/EMP001_PAN_CARD_V1_20260729190000.pdf
     *   EMP002/EMP002_BANK_PASSBOOK_V1_20260729190500.pdf
     *
     * S3 has no real directories — the prefix is created implicitly by the
     * first object written under it, so nothing needs pre-creating.
     *
     * $ownerType is still validated (an unknown type is rejected) but is not
     * part of the key; the employee reference alone separates owners.
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

    /**
     * <AadhaarOrRef>/<AppointmentId>/<DocumentType>/<GeneratedFileName>
     *
     *   123456789012/104/PAN_CARD/PAN_CARD_V1_20260730112000.pdf
     *   123456789012/106/PAN_CARD/PAN_CARD_V1_20260730112100.pdf
     *
     * The appointment id is the second segment specifically so two records that
     * share an Aadhaar number — which the backfill found 9 of — keep separate
     * folders instead of one appearing as a new version of the other.
     */
    public static function appointmentKey(
        string $aadhaarOrRef,
        $appointmentId,
        string $documentType,
        string $fileName
    ): string {
        $key = implode('/', [
            self::sanitiseSegment($aadhaarOrRef, 'aadhaar reference'),
            self::sanitiseSegment((string) $appointmentId, 'appointment id'),
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

    /**
     * True when a stored value is one of our S3 object keys rather than a
     * legacy local path ("uploads/photos/…") or an already-absolute URL.
     */
    public static function looksLikeObjectKey(?string $value): bool
    {
        if (!$value || preg_match('#^(https?:)?//#i', $value) || str_starts_with($value, 'data:')) {
            return false;
        }

        // Legacy local storage under public/uploads is never an object key.
        if (str_starts_with($value, 'uploads/')) {
            return false;
        }

        // Keys written before the flat layout, still valid in the bucket.
        foreach (self::OWNER_PREFIXES as $prefix) {
            if (str_starts_with($value, $prefix . '/')) {
                return true;
            }
        }

        if (str_starts_with($value, self::ARCHIVE_PREFIX . '/')
            || str_starts_with($value, self::TEMP_PREFIX . '/')) {
            return true;
        }

        // Current layout is <aadhaar>/<appointmentId>/<type>/<file>; earlier
        // revisions wrote two or three segments. Accept any of them, always
        // ending in an extension. Local paths were excluded above.
        return (bool) preg_match('#^[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+){1,4}\.[A-Za-z0-9]{1,10}$#', $value);
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
