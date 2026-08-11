<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A company — the tenant every scope check ultimately resolves to.
 *
 * `code` is not a label. It is the value stored in users.company_code, which
 * ScopeMatcher, AuthorizedUserQuery and the authorization cache partition on, so
 * changing it silently rescopes every account that carries it. CompanyUnitService
 * locks it once the company is in use for exactly that reason.
 */
class Company extends Model
{
    protected $fillable = ['name', 'code', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function units()
    {
        return $this->hasMany(Unit::class);
    }
}
