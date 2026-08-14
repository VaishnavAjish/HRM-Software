<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_activity_logs — immutable organization activity records (02.01, 02.09).
 *
 * Enterprise history, change request audit trail, and all organization mutations.
 */
class OrganizationActivityLog extends Model
{
    protected $fillable = [
        'enterprise_id',
        'company_id',
        'activity_type',
        'subject_type',
        'subject_id',
        'actor_id',
        'before_values',
        'after_values',
        'description',
        'ip_address',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'before_values' => 'array',
            'after_values' => 'array',
        ];
    }

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
