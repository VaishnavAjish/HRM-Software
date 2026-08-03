<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class AuthorizationRoleAssignment extends Model
{
    protected $fillable = [
        'user_id', 'role_id', 'tenant_id', 'scope_type', 'scope_id',
        'valid_from', 'valid_until', 'assignment_source', 'assignment_reason',
        'assigned_by', 'approved_by', 'status',
    ];

    protected function casts(): array
    {
        return ['valid_from' => 'datetime', 'valid_until' => 'datetime'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'ACTIVE')
            ->where(fn (Builder $q) => $q->whereNull('valid_from')->orWhere('valid_from', '<=', now()))
            ->where(fn (Builder $q) => $q->whereNull('valid_until')->orWhere('valid_until', '>', now()));
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
