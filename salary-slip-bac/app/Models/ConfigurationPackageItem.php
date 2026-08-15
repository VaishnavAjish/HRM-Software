<?php

namespace App\Models;

/**
 * ConfigurationPackageItem — Domain 00.8 Configuration Management.
 *
 * Individual items within a configuration package. Each item represents a
 * configuration value, setting, or parameter that can be exported, imported,
 * compared, and promoted through environments.
 *
 * Every export must enforce the same:
 * - RBAC
 * - ABAC
 * - tenant scope
 * - data scope
 * - field permissions
 */
class ConfigurationPackageItem extends Model
{
    protected $fillable = [
        'package_id',
        'key',
        'value',
        'value_type', // string, number, boolean, array, object
        'is_sensitive',
        'field_permissions',
        'tenant_scoped',
        'company_scoped',
        'depends_on',
        'sort_order',
    ];

    protected $casts = [
        'is_sensitive' => 'boolean',
        'tenant_scoped' => 'boolean',
        'company_scoped' => 'boolean',
        'depends_on' => 'array',
        'sort_order' => 'integer',
    ];

    public function package()
    {
        return $this->belongsTo(ConfigurationPackage::class);
    }

    public function isSensitive(): bool
    {
        return $this->is_sensitive ?? false;
    }

    public function requiresApproval(): bool
    {
        return $this->is_sensitive || !empty($this->field_permissions);
    }
}