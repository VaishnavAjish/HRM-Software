<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_calendar_assignments — calendar assignments to scopes (02.10).
 *
 * Enterprise, company, country, location, department assignments. Precedence:
 * Department → Location → Company → Enterprise → Country.
 */
class OrganizationCalendarAssignment extends Model
{
    public const KINDS = ['working_day', 'financial', 'payroll'];

    public const SCOPES = ['enterprise', 'company', 'country', 'location', 'department'];

    protected $fillable = [
        'calendar_id',
        'calendar_kind',
        'scope_type',
        'scope_id',
        'priority',
        'effective_from',
        'effective_to',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'priority' => 'integer',
            'effective_from' => 'date',
            'effective_to' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function calendar()
    {
        return $this->belongsTo(Calendar::class);
    }
}
