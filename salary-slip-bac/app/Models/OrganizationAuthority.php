<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OrganizationAuthority extends Model
{
    use HasFactory;

    protected $table = 'organization_authorities';

    protected $fillable = [
        'name',
        'role',
        'child_ids',
    ];

    protected $casts = [
        'child_ids' => 'array',
    ];

    protected $appends = [
        'childIds',
    ];

    public function getChildIdsAttribute(): array
    {
        $val = $this->attributes['child_ids'] ?? null;
        if (is_array($val)) return $val;
        if (is_string($val)) return json_decode($val, true) ?? [];
        return [];
    }
}
