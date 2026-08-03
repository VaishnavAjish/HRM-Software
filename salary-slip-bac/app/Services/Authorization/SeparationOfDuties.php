<?php

namespace App\Services\Authorization;

use App\Models\Role;
use Illuminate\Support\Facades\DB;

class SeparationOfDuties
{
    public function conflicts(int $userId, Role $candidate, ?string $tenantId): array
    {
        $assignedCodes = DB::table('authorization_role_assignments as a')
            ->join('roles as r', 'r.id', '=', 'a.role_id')
            ->where('a.user_id', $userId)->where('a.status', 'ACTIVE')
            ->where(fn ($q) => $q->whereNull('a.valid_until')->orWhere('a.valid_until', '>', now()))
            ->when($tenantId, fn ($q) => $q->where(fn ($x) => $x->whereNull('a.tenant_id')->orWhere('a.tenant_id', $tenantId)))
            ->pluck('r.code')->filter()->all();

        return DB::table('authorization_sod_rules')->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId))
            ->get()->filter(function ($rule) use ($candidate, $assignedCodes) {
                $codes = json_decode($rule->conflicting_role_codes ?: '[]', true) ?: [];
                return in_array($candidate->code, $codes, true) && count(array_intersect($assignedCodes, $codes)) > 0;
            })->map(fn ($rule) => ['code' => $rule->code, 'name' => $rule->name, 'enforcement' => $rule->enforcement])->values()->all();
    }
}
