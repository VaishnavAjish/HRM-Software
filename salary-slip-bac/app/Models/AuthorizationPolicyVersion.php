<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuthorizationPolicyVersion extends Model
{
    protected $fillable = [
        'policy_id', 'version', 'snapshot', 'change_summary',
        'previous_version_id', 'changed_by', 'approved_by', 'approved_at',
        'effective_at', 'deployment_status',
    ];

    protected function casts(): array
    {
        return [
            'snapshot' => 'array', 'approved_at' => 'datetime',
            'effective_at' => 'datetime',
        ];
    }
}
