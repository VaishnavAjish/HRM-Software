<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_classifications — compliance and regulatory classifications (03.01).
 *
 * Supports: Job Class, Worker Class, Employee Group, Job Type, Occupational Category, Compliance Classification.
 */
class JobClassification extends Model
{
    protected $fillable = [
        'job_id',
        'job_class',
        'worker_class',
        'employee_group',
        'job_type',
        'occupational_category',
        'compliance_classification',
        'additional_classifications',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'additional_classifications' => 'array',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function job()
    {
        return $this->belongsTo(Job::class);
    }
}
