<?php

namespace App\Services\Authorization;

use App\Models\AuthorizationRoleAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Schema;

class AuthorizedUserQuery
{
    public function apply(Builder $query, User $actor): Builder
    {
        if ((int) $actor->role === 0 || (int) $actor->role === 1) {
            return $query;
        }

        $companies = array_values(array_filter(array_map('trim', explode(',', (string) $actor->company_code))));
        if (Schema::hasTable('authorization_role_assignments')) {
            $scopedCompanies = AuthorizationRoleAssignment::active()
                ->where('user_id', $actor->id)
                ->whereIn('scope_type', ['TENANT', 'COMPANY'])
                ->pluck('scope_id')->filter()->all();
            $companies = array_values(array_unique(array_merge($companies, $scopedCompanies)));
        }

        if (array_intersect(['all', 'all-companies'], $companies)) {
            return $query;
        }
        if (!$companies) {
            return $query->whereRaw('1 = 0');
        }
        $query->whereIn('company_code', $companies);
        if ((int) $actor->role === 2 && filled($actor->unit)) {
            $query->where('unit', $actor->unit);
        }
        return $query;
    }
}
