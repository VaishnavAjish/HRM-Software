<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A location — a physical place in the business structure (02.03 / 02.04).
 *
 * Belongs to exactly one company, may hang under a parent location (a branch
 * under a head office), and `kind` classifies it as branch / site / warehouse /
 * office. A code is unique within a company, never globally — unit names are not
 * global either ("Ichapur" exists under both companies), and a location tree is
 * meaningless without its tenant. `members()` is the normalised assignment
 * pivot; users.unit stays the load-bearing legacy string.
 */
class Location extends Model
{
    public const KINDS = ['branch', 'site', 'warehouse', 'office'];

    protected $fillable = [
        'company_id',
        'parent_id',
        'code',
        'name',
        'kind',
        'is_active',
        'address',
        'city',
        'state',
        'country_code',
        'postal_code',
        'latitude',
        'longitude',
        'contact_email',
        'contact_phone',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
        ];
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function members()
    {
        return $this->belongsToMany(User::class, 'user_locations');
    }
}