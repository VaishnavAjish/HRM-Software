<?php

namespace App\Support;

use RuntimeException;

/**
 * Turns an Aadhaar number into a deterministic, non-reversible reference safe
 * to use as a storage prefix.
 *
 *   123456789012  ->  AADHAAR_9012_a81f46c29d31
 *
 * The HMAC means the same person always resolves to the same folder while the
 * number itself cannot be recovered from the key — which matters because the
 * key travels into bucket listings, S3 access logs, CloudTrail and every
 * presigned URL. Only the last four digits are exposed, matching the masking
 * convention used everywhere else in the UI.
 *
 * Changing AADHAAR_REFERENCE_SECRET changes every reference, so it must be
 * treated as permanent data, not a rotatable credential — rotating it orphans
 * existing folders.
 */
class AadhaarReference
{
    /** Digits only, no spaces or hyphens. Returns '' when nothing usable. */
    public static function normalise(?string $value): string
    {
        return preg_replace('/\D+/', '', (string) $value) ?? '';
    }

    public static function isValid(?string $value): bool
    {
        return (bool) preg_match('/^\d{12}$/', self::normalise($value));
    }

    public static function lastFour(?string $value): string
    {
        $digits = self::normalise($value);

        return strlen($digits) >= 4 ? substr($digits, -4) : '';
    }

    /** Display form: "XXXX XXXX 9012". Never show more than this. */
    public static function mask(?string $value): string
    {
        $last = self::lastFour($value);

        return $last === '' ? '' : 'XXXX XXXX ' . $last;
    }

    /**
     * @throws RuntimeException when the number is invalid or the secret is unset
     */
    public static function secureReference(?string $value): string
    {
        $digits = self::normalise($value);

        if (!self::isValid($digits)) {
            throw new RuntimeException('Invalid Aadhaar number.');
        }

        $secret = (string) config('documents.aadhaar_reference_secret');

        if ($secret === '') {
            // Failing loudly beats silently deriving references from an empty
            // key, which would be trivially reproducible by anyone.
            throw new RuntimeException('AADHAAR_REFERENCE_SECRET is not configured.');
        }

        // Hash only — not even the last four digits appear in the reference,
        // because it becomes a storage prefix that reaches bucket listings,
        // access logs and presigned URLs.
        return 'AADHAAR_' . substr(hash_hmac('sha256', $digits, $secret), 0, 16);
    }

    /**
     * Replace any 12-digit run that looks like an Aadhaar number with its
     * masked form. Used to keep the number out of log lines and error text.
     */
    public static function redact(?string $text): string
    {
        return (string) preg_replace_callback(
            '/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/',
            fn ($m) => self::mask($m[0]),
            (string) $text
        );
    }
}
