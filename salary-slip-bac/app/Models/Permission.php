<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Permission extends Model
{
    protected $fillable = [
        'name', 'code', 'resource', 'action', 'level', 'group_id',
        'description', 'is_sensitive', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_sensitive' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function group()
    {
        return $this->belongsTo(PermissionGroup::class, 'group_id');
    }

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'role_permissions');
    }
}
