<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * The one definition of how company membership and users.company_code convert.
 *
 * Membership lives in user_companies; authorization still reads the legacy CSV
 * on users.company_code. Both have to be written together, and they have to
 * agree exactly, so the conversion belongs in one place rather than in each
 * caller that happens to save a user.
 *
 * Serialisation is sorted, so the same set of companies always produces the same
 * string. Without that, the value would depend on the order an administrator
 * happened to tick the boxes, and two identical selections would compare as
 * different — which matters because that string is the tenant key the
 * authorization cache partitions on.
 *
 * "all-companies" and "all" are request filters meaning "do not scope this
 * query". They are not companies, no user holds one, and parse() drops them
 * rather than reporting them as unrecognised.
 */
class CompanyMembership
{
    /** Request-scope sentinels that are not companies. */
    private const SENTINELS = ['all', 'all-companies'];

    /**
     * The company codes in a legacy company_code value.
     *
     * Splits on the same delimiter the existing parsers use, trims, drops blanks
     * and sentinels, and de-duplicates while preserving nothing about order —
     * callers that need a stable order should use serialize().
     *
     * @return list<string>
     */
    public static function parse(?string $companyCode): array
    {
        $tokens = array_map('trim', explode(',', (string) $companyCode));

        $codes = array_filter(
            $tokens,
            fn ($code) => $code !== '' && ! in_array($code, self::SENTINELS, true),
        );

        return array_values(array_unique($codes));
    }

    /**
     * The legacy company_code value for a set of company codes.
     *
     * Sorted so the result depends only on which companies were chosen.
     */
    public static function serialize(array $companyCodes): string
    {
        $codes = array_values(array_unique(array_filter(array_map('trim', $companyCodes))));

        sort($codes);

        return implode(',', $codes);
    }

    /**
     * The legacy company_code value for a set of company ids.
     *
     * Ids that match no company are dropped rather than silently producing an
     * empty scope — validation is the caller's job, and this must not invent one.
     */
    public static function serializeIds(array $companyIds): string
    {
        if ($companyIds === []) {
            return '';
        }

        $codes = DB::table('companies')
            ->whereIn('id', $companyIds)
            ->pluck('code')
            ->all();

        return self::serialize($codes);
    }
}
