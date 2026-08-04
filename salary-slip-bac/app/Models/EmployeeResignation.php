<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmployeeResignation extends Model
{
    protected $fillable = [
        'user_id', 'reason', 'resignation_date', 'last_working_day', 'notice_period_days',
        'status', 'approved_by', 'approved_at', 'notes', 'company_code', 'unit', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'resignation_date' => 'date',
            'last_working_day' => 'date',
            'approved_at' => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
