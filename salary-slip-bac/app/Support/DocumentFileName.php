<?php

namespace App\Support;

/**
 * Enterprise filename generation.
 *
 *   <EntityID>_<EntityName>_<DocumentType>_V<Version>_<YYYYMMDDHHMMSS>.<ext>
 *   EMP1025_RohitSaket_PAN_CARD_V1_20260729154530.pdf
 *
 * Timestamps are UTC so names sort consistently regardless of server timezone.
 * The extension comes from the sniffed MIME type, never from the browser.
 */
class DocumentFileName
{
    public const TIMESTAMP_FORMAT = 'YmdHis';

    private const MAX_NAME_LENGTH = 180;
    private const MAX_ENTITY_NAME = 40;

    /** Windows reserved device names — unusable as filenames on some hosts. */
    private const RESERVED = [
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
    ];

    /** "Rohit  Saket!" -> "RohitSaket" */
    public static function entityName(?string $name): string
    {
        $parts = preg_split('/\s+/', trim((string) $name)) ?: [];
        $clean = '';

        foreach ($parts as $part) {
            $part = preg_replace('/[^A-Za-z0-9]+/u', '', $part);
            if ($part !== '') {
                $clean .= ucfirst(strtolower($part));
            }
        }

        $clean = substr($clean, 0, self::MAX_ENTITY_NAME);

        return $clean !== '' ? $clean : 'User';
    }

    /** Employee code if present, else a padded surrogate from the row id. */
    public static function entityId(?string $code, $fallbackId = null): string
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]+/u', '', (string) $code) ?? '');

        if ($code !== '') {
            return substr($code, 0, self::MAX_ENTITY_NAME);
        }

        return $fallbackId
            ? 'USR' . str_pad((string) $fallbackId, 6, '0', STR_PAD_LEFT)
            : 'USR000000';
    }

    public static function timestamp(?\DateTimeInterface $at = null): string
    {
        $at = $at ? \DateTimeImmutable::createFromInterface($at) : new \DateTimeImmutable('now');

        return $at->setTimezone(new \DateTimeZone('UTC'))->format(self::TIMESTAMP_FORMAT);
    }

    /**
     * Canonical extension for a sniffed MIME type. Falls back to a sanitised
     * hint only when the MIME type is unknown to us.
     */
    public static function extensionFor(?string $mimeType, ?string $hint = null): string
    {
        $map = config('documents.mime_extension_map', []);

        if ($mimeType && isset($map[$mimeType])) {
            return $map[$mimeType];
        }

        $hint = strtolower(preg_replace('/[^A-Za-z0-9]+/u', '', (string) $hint) ?? '');

        return $hint !== '' ? substr($hint, 0, 10) : 'bin';
    }

    public static function build(
        string $entityId,
        ?string $entityName,
        string $documentType,
        int $version,
        string $extension,
        ?\DateTimeInterface $at = null
    ): string {
        $stem = sprintf(
            '%s_%s_%s_V%d_%s',
            self::entityId($entityId),
            self::entityName($entityName),
            strtoupper(preg_replace('/[^A-Za-z0-9_]+/u', '_', $documentType) ?? 'OTHER'),
            max(1, $version),
            self::timestamp($at)
        );

        $stem = preg_replace('/_{2,}/', '_', $stem);
        $stem = trim((string) $stem, '_');

        // A reserved device name is only a problem as the whole stem.
        if (in_array(strtoupper($stem), self::RESERVED, true)) {
            $stem = 'FILE_' . $stem;
        }

        $extension = strtolower(preg_replace('/[^A-Za-z0-9]+/u', '', $extension) ?? 'bin') ?: 'bin';
        $stem = substr($stem, 0, self::MAX_NAME_LENGTH - strlen($extension) - 1);

        return $stem . '.' . $extension;
    }

    /** Human-readable name for Content-Disposition on download. */
    public static function downloadName(string $generatedName): string
    {
        return preg_replace('/[^A-Za-z0-9._-]+/u', '_', $generatedName) ?: 'document';
    }
}
