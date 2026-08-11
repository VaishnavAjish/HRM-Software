<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A unit, belonging to exactly one company.
 *
 * The name is unique within a company, not globally: "Ichapur" is a real place
 * inside both Nidhi Impex and Silver Star, and a global unique key would force
 * one of them to be renamed to something nobody calls it.
 */
class Unit extends Model
{
    protected $fillable = ['company_id', 'name', 'code', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
