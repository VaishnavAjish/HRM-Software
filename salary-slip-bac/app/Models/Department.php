<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Department extends Model
{
    protected $fillable = ["name", "company_code", "manager_id", "unit_id", "parent_department_id"];

    public function managers()
    {
        return $this->belongsToMany(User::class, "department_managers", "department_id", "user_id")->withTimestamps();
    }

    public function manager()
    {
        return $this->belongsTo(User::class, "manager_id");
    }

    public function unit()
    {
        return $this->belongsTo(Unit::class, "unit_id");
    }

    public function parentDepartment()
    {
        return $this->belongsTo(Department::class, "parent_department_id");
    }

    public function childDepartments()
    {
        return $this->hasMany(Department::class, "parent_department_id");
    }
}

