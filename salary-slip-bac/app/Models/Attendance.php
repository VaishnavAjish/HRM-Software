<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    // present | absent | half_day | leave
    public const STATUSES = ['present', 'absent', 'half_day', 'leave'];

    protected $fillable = [
        'emp_code', 'company_code', 'unit', 'date', 'status', 'marked_by',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
        ];
    }

    public function markedBy()
    {
        return $this->belongsTo(User::class, 'marked_by');
    }
}
