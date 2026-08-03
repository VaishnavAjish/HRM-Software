<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuthorizationFeatureFlag extends Model
{
    protected $fillable = ['tenant_id', 'key', 'enabled', 'configuration', 'updated_by'];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'configuration' => 'array'];
    }
}
