<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    protected $fillable = [
        'name', 'code', 'description', 'type', 'role_type', 'tenant_id',
        'is_active', 'is_system', 'is_assignable', 'is_sensitive',
        'is_direct_creatable',
        'requires_approval', 'default_scope_type', 'status', 'version',
        'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_system' => 'boolean',
            'is_assignable' => 'boolean',
            'is_sensitive' => 'boolean',
            'is_direct_creatable' => 'boolean',
            'requires_approval' => 'boolean',
        ];
    }

    public function permissions()
    {
        return $this->belongsToMany(Permission::class, 'role_permissions')
            ->withPivot([
                'effect', 'conditions', 'obligations', 'inherit_to_children',
                'valid_from', 'valid_until',
            ]);
    }

    public function users()
    {
        return $this->belongsToMany(User::class, 'user_roles');
    }

    public function assignments()
    {
        return $this->hasMany(AuthorizationRoleAssignment::class);
    }

    public function parentRoles()
    {
        return $this->belongsToMany(
            Role::class,
            'authorization_role_inheritances',
            'child_role_id',
            'parent_role_id'
        )->withPivot(['max_depth', 'inherit_sensitive']);
    }
}
