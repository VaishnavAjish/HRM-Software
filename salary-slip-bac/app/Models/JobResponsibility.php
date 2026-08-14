<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_responsibilities — structured responsibilities linked to jobs (03.01).
 *
 * Multiple responsibilities per job with priority, percentage, competency, KPI/KRA linkage.
 */
class JobResponsibility extends Model
{
    protected $fillable = [
        'job_id',
        'responsibility',
        'priority',
        'percentage',
        'competency_id',
        'kpi_linkage',
        'kra_linkage',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'priority' => 'integer',
            'percentage' => 'decimal:2',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function job()
    {
        return $this->belongsTo(Job::class);
    }
}
