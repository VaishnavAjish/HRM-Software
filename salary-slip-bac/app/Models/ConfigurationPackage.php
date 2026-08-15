<?php

namespace App\Models;

/**
 * ConfigurationPackage — Domain 00.8 Configuration Management.
 *
 * Configuration packages group related configuration for export/import/promotion.
 * Example: India Configuration Package → Country settings, Localization, Calendar,
 * Payroll references, Tax references.
 *
 * Do NOT place live employee transactional records inside configuration packages.
 */
class ConfigurationPackage extends Model
{
    protected $fillable = [
        'name',
        'code',
        'description',
        'version',
        'status',
        'environment', // development, qa, staging, production
        'creator_id',
        'approver_id',
        'approved_at',
        'effective_date',
        'change_reason',
        'is_exportable',
    ];

    protected $casts = [
        'version' => 'string',
        'is_exportable' => 'boolean',
        'approved_at' => 'datetime',
        'effective_date' => 'date',
    ];

    public function items()
    {
        return $this->hasMany(ConfigurationPackageItem::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approver_id');
    }

    public function isFinal(): bool
    {
        return $this->status === 'approved' && !is_null($this->approved_at);
    }

    public function canBePromoted(): bool
    {
        return $this->status === 'approved' && $this->isFinal();
    }
}