<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * job_categories — categorical classification of jobs (03.01).
 *
 * Examples: Management, Professional, Technical, Operational, Administrative, Support, Executive.
 * Configurable per enterprise.
 */
class JobCategory extends Model
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

    public function jobs()
    {
        return $this->hasMany(Job::class);
    }
}
