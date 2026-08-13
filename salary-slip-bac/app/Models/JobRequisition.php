<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class JobRequisition extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'title', 'department_id', 'department_manager_id', 'designation', 'employment_type', 'openings',
        'priority', 'status', 'min_experience', 'max_experience', 'salary_min',
        'salary_max', 'description', 'requirements', 'company_code', 'unit',
        'requested_by', 'approved_by', 'target_closing_date', 'approved_at',
        'posted_at', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
            'posted_at' => 'datetime',
            'closed_at' => 'datetime',
            'target_closing_date' => 'date',
        ];
    }

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function departmentManager()
    {
        return $this->belongsTo(User::class, 'department_manager_id');
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function candidates()
    {
        return $this->hasMany(Candidate::class, 'requisition_id');
    }
}
