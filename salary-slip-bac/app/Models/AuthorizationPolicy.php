<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class AuthorizationPolicy extends Model
{
    protected $fillable = [
        'tenant_id', 'code', 'name', 'description', 'effect', 'subjects',
        'actions', 'resources', 'scope_type', 'scope_id', 'conditions',
        'obligations', 'priority', 'valid_from', 'valid_until', 'status',
        'version', 'audit_required', 'created_by', 'updated_by', 'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'subjects' => 'array', 'actions' => 'array', 'resources' => 'array',
            'conditions' => 'array', 'obligations' => 'array',
            'valid_from' => 'datetime', 'valid_until' => 'datetime',
            'approved_at' => 'datetime', 'audit_required' => 'boolean',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'ACTIVE')
            ->where(fn (Builder $q) => $q->whereNull('valid_from')->orWhere('valid_from', '<=', now()))
            ->where(fn (Builder $q) => $q->whereNull('valid_until')->orWhere('valid_until', '>', now()));
    }

    public function versions()
    {
        return $this->hasMany(AuthorizationPolicyVersion::class, 'policy_id');
    }
}
