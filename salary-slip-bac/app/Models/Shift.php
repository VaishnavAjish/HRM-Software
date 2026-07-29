<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Shift extends Model
{
    protected $fillable = [
        'name', 'company_code', 'unit', 'start_time', 'end_time', 'grace_minutes', 'description',
    ];

    public function employees()
    {
        return $this->hasMany(User::class, 'shift_id');
    }
}
