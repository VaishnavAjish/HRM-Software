<?php

namespace App\Support;

use App\Models\Role;

class SystemRoles
{
    public static function protectedCodes(): array
    {
        return array_values(array_filter(array_map(
            'strval',
            (array) config('security.system_role_codes', ['super_administrator'])
        )));
    }

    public static function revealed(): bool
    {
        return (bool) config('security.show_system_role', false);
    }

    public static function isProtected(Role|string|null $role): bool
    {
        if ($role === null) {
            return false;
        }

        $code = $role instanceof Role ? $role->code : $role;

        return $code !== null && in_array((string) $code, self::protectedCodes(), true);
    }

    public static function exclude($query, string $table = 'roles')
    {
        if (self::revealed()) {
            return $query;
        }

        $codes = self::protectedCodes();

        if ($codes === []) {
            return $query;
        }

        return $query->whereNotIn($table . '.code', $codes);
    }
}
