<?php

namespace App\Services\Authorization;

use Illuminate\Support\Facades\Schema;

/**
 * Schema capability probe for the authorization stack.
 *
 * The engine runs against two schema generations. The enterprise migration adds
 * columns to the base RBAC tables (permissions.code/is_active, the validity and
 * condition columns on role_permissions/user_permissions); a deployment that has
 * not run it — or that rolled back to the _pre_authz_* snapshot — still has the
 * thin tables. Table-level Schema::hasTable() guards already cover the tables the
 * migration creates outright, but not these added columns, so queries that
 * referenced them unconditionally failed with "column does not exist".
 *
 * Results are memoised per process: hasColumn() is a round trip to the
 * information schema, and decide() runs it on every permission in a me() sweep.
 */
class SchemaSupport
{
    /** @var array<string, bool> */
    private static array $columns = [];

    /** @var array<string, bool> */
    private static array $tables = [];

    public static function hasColumn(string $table, string $column): bool
    {
        return self::$columns[$table . '.' . $column] ??= self::hasTable($table)
            && Schema::hasColumn($table, $column);
    }

    public static function hasTable(string $table): bool
    {
        return self::$tables[$table] ??= Schema::hasTable($table);
    }

    /**
     * Columns from $candidates that actually exist on $table.
     *
     * @param  list<string>  $candidates
     * @return list<string>
     */
    public static function present(string $table, array $candidates): array
    {
        return array_values(array_filter(
            $candidates,
            fn (string $column) => self::hasColumn($table, $column)
        ));
    }

    /**
     * Forget probe results. Only needed when a migration runs inside the same
     * process as a decision — chiefly the test suite.
     */
    public static function flush(): void
    {
        self::$columns = [];
        self::$tables = [];
    }
}
