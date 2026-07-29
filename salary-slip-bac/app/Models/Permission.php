<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Permission extends Model
{
    protected $fillable = ['name', 'group_id', 'description'];

    public function group()
    {
        return $this->belongsTo(PermissionGroup::class, 'group_id');
    }

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'role_permissions');
    }
}
