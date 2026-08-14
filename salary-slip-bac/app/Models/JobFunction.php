<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_functions — functional classification of jobs (03.01).
 *
 * Examples: HR, Finance, IT, Operations, Sales, Manufacturing, Procurement, Legal, Quality, Administration.
 * A Job Function may contain multiple Job Families.
 */
class JobFunction extends Model
{
    public const STATUSES = ['active', 'inactive'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'code',
        'name',
        'description',
        'status',
        'sort_order',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'effective_from' => 'date',
            'effective_to' => 'date',
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

    public function families()
    {
        return $this->hasMany(JobFamily::class);
    }

    public function jobs()
    {
        return $this->hasMany(Job::class);
    }
}
