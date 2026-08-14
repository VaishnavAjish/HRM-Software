<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DepartmentManager extends Model
{
    protected $table = "department_managers";
    protected $fillable = ["department_id", "user_id"];

    public function department()
    {
        return $this->belongsTo(Department::class, "department_id");
    }

    public function user()
    {
        return $this->belongsTo(User::class, "user_id");
    }
}

