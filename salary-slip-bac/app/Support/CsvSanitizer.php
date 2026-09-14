<?php

namespace App\Support;

/**
 * Formula-injection sanitization for CSV/Excel exports, shared across every
 * export action in the app.
 *
 * A cell that begins with a formula trigger character (`=`, `+`, `-`, `@`) or
 * a tab/CR is interpreted as an expression by spreadsheet applications, so a
 * value planted in the database (a free-text remark, a hospital name, a
 * disallow reason, ...) could run a formula/DDE payload on whoever's machine
 * opens the export. The standard mitigation — and the one already in use at
 * `Api\V1\Admin\UserController::sanitizeCsvCell()` — is to neutralise those
 * cells by prefixing them with a single quote so spreadsheet software reads
 * them as literal text.
 *
 * `Api\V1\Admin\UserController` keeps its own private copy of this same
 * logic rather than being refactored to call this class, since that
 * controller sits outside this task's scope and is not otherwise touched
 * here. This class exists so every *new* export (starting with
 * `Mediclaim\Admin\ReportController::export()`) has one shared place to call
 * instead of re-implementing the same check, and every cell is sanitized
 * uniformly rather than trying to guess which columns are "free text" and
 * which are safely numeric/date/enum.
 */
class CsvSanitizer
{
    private const TRIGGER_CHARS = ['=', '+', '-', '@', "\t", "\r"];

    public static function sanitizeCell(?string $value): string
    {
        $value = (string) $value;

        if (in_array($value[0] ?? '', self::TRIGGER_CHARS, true)) {
            return "'".$value;
        }

        return $value;
    }

    /** Sanitizes every value in an associative row, keys left untouched. */
    public static function sanitizeRow(array $row): array
    {
        return array_map(
            static fn ($value) => self::sanitizeCell($value === null ? '' : (string) $value),
            $row
        );
    }
}
