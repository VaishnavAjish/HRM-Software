<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuthorizationDecisionLog extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'matched_policy_ids' => 'array', 'failed_conditions' => 'array',
            'scope' => 'array', 'obligations' => 'array', 'changed_fields' => 'array',
        ];
    }
}
