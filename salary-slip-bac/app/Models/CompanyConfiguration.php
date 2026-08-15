<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Company configuration — Domain 00.1 Tenant Configuration management.
 *
 * Stores configurable tenant overrides for:
 * - language, currency, time zone
 * - date/time/number formats
 * - financial year, week start, working week
 * - feature flags, policies, localization
 * - security references
 *
 * Uses centralized configuration resolution with platform → tenant → company →
 * country/user precedence.
 */
class CompanyConfiguration extends Model
{
    protected $fillable = [
        'company_id',
        'language',
        'currency',
        'timezone',
        'date_format',
        'time_format',
        'number_format',
        'financial_year_start_month',
        'week_start_day',
        'working_week',
        'features',
        'policies',
        'localization',
        'security_references',
        'maintenance_mode',
        'maintenance_message',
        'maintenance_until',
    ];

    protected $casts = [
        'language' => 'string',
        'currency' => 'string',
        'timezone' => 'string',
        'date_format' => 'string',
        'time_format' => 'string',
        'number_format' => 'string',
        'financial_year_start_month' => 'integer',
        'week_start_day' => 'integer',
        'working_week' => 'string',
        'features' => 'array',
        'policies' => 'array',
        'localization' => 'array',
        'security_references' => 'array',
        'maintenance_mode' => 'boolean',
        'maintenance_until' => 'date',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function getEffectiveLanguage(): string
    {
        return $this->language ?? config('app.locale', 'en');
    }

    public function getEffectiveCurrency(): string
    {
        return $this->currency ?? config('app.currency', 'USD');
    }

    public function getEffectiveTimezone(): string
    {
        return $this->timezone ?? config('app.timezone', 'UTC');
    }

    public function isMaintenanceMode(): bool
    {
        return $this->maintenance_mode && is_null($this->maintenance_until) ||
               !$this->maintenance_mode || now()->lte($this->maintenance_until);
    }

    public function getMaintenanceMessage(): ?string
    {
        if (!$this->isMaintenanceMode()) {
            return null;
        }
        return $this->maintenance_message;
    }
}