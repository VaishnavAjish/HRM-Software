<?php

namespace App\Http\Controllers\Admin;

use App\Models\ApprovalLevel;

class ApprovalLevelController extends BaseResourceController
{
    protected string $model = ApprovalLevel::class;
    protected string $moduleName = 'Approval Level';
    protected string $orderByColumn = 'level';
    protected array $rules = [
        'name' => 'required|string',
        'level' => 'required|integer|min:1',
        'type' => 'required|in:Auto Approval,Manual Approval',
    ];
}
