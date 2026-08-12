<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmployeeFamilyMember extends Model
{
    protected $table = 'employee_family_members';

    protected $fillable = ['user_id', 'name', 'relation', 'mobile_number'];
}
