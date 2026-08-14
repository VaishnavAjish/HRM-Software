<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_descriptions — versioned structured job descriptions (03.01).
 *
 * Never overwrite historical job descriptions used by past employees or recruitment campaigns.
 * Each version is immutable once created.
 */
class JobDescription extends Model
{
    public const STATUSES = ['draft', 'published', 'archived'];

    protected $fillable = [
        'job_id',
        'version',
        'summary',
        'purpose',
        'responsibilities',
        'qualifications',
        'skills',
        'competencies',
        'experience',
        'education',
        'work_conditions',
        'travel_requirements',
        'risk',
        'remote_eligible',
        'remote_eligibility_type',
        'remote_conditions',
        'status',
        'created_by',
        'approved_by',
        'approved_at',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'remote_eligible' => 'boolean',
            'remote_conditions' => 'array',
            'approved_at' => 'datetime',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function job()
    {
        return $this->belongsTo(Job::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
