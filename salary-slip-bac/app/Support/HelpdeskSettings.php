<?php

namespace App\Support;

use App\Models\Setting;
use App\Services\Authorization\SchemaSupport;

/**
 * Configurable helpdesk behaviour, stored in the shared settings table.
 *
 * These were constants: the reopen window lived on Ticket as a class constant
 * and the Settings tab printed "7 days" as static prose, so the only way to
 * change it was a deploy. Reading them here keeps one definition that both the
 * enforcement path and the screen use.
 *
 * Values are cached per request. A ticket list resolves the reopen window once
 * per row otherwise, which is a query per ticket for a number that cannot change
 * mid-request.
 */
class HelpdeskSettings
{
    public const GROUP = 'helpdesk';

    public const DEFAULTS = [
        // Days a resolved ticket stays reopenable by the employee.
        'helpdesk.reopen_window_days' => '7',
        // Days after which a resolved ticket is closed automatically. 0 = never.
        'helpdesk.auto_close_resolved_days' => '0',
        'helpdesk.default_priority' => 'medium',
        // Whether the queue may hand a ticket to a manager (role 2) as well as
        // an admin.
        'helpdesk.allow_manager_assignment' => 'true',
    ];

    private static ?array $cache = null;

    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        // The settings table is not in every deployment this code runs against
        // (tests build the schema progressively), and a missing table must not
        // turn every ticket read into a 500.
        if (! SchemaSupport::hasTable('settings')) {
            return self::$cache = self::DEFAULTS;
        }

        $stored = Setting::where('group', self::GROUP)->pluck('value', 'key')->all();

        return self::$cache = array_merge(self::DEFAULTS, array_filter(
            $stored,
            fn ($value, $key) => array_key_exists($key, self::DEFAULTS) && $value !== null && $value !== '',
            ARRAY_FILTER_USE_BOTH
        ));
    }

    public static function get(string $key, mixed $fallback = null): mixed
    {
        return self::all()[$key] ?? $fallback ?? (self::DEFAULTS[$key] ?? null);
    }

    public static function int(string $key): int
    {
        return (int) self::get($key);
    }

    public static function bool(string $key): bool
    {
        return filter_var(self::get($key), FILTER_VALIDATE_BOOLEAN);
    }

    /** Call after writing, so the rest of the request sees the new values. */
    public static function flush(): void
    {
        self::$cache = null;
    }
}
