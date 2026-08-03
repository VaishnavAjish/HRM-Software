<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuthorizationAccessRequest extends Model
{
    protected $fillable = [
        'tenant_id', 'requester_id', 'target_user_id', 'role_id',
        'permission_code', 'scope_type', 'scope_id', 'business_reason',
        'requested_until', 'status', 'decided_by', 'decision_reason',
        'decided_at', 'revoked_at', 'revoked_by',
    ];

    protected function casts(): array
    {
        return [
            'requested_until' => 'datetime', 'decided_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function targetUser()
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }
}
