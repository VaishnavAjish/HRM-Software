<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalLevel extends Model
{
    protected $fillable = ['name', 'level', 'type'];
}
