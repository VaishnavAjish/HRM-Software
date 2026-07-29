<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PermissionDimension extends Model
{
    protected $fillable = ['dimension', 'role_id', 'key_name', 'value', 'meta'];

    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }
}
