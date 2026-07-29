<?php

namespace App\Http\Controllers\Admin;

use App\Models\Team;

class TeamController extends BaseResourceController
{
    protected string $model = Team::class;
    protected string $moduleName = 'Team';
    protected array $rules = [
        'name' => 'required|string',
        'department_id' => 'nullable|integer|exists:departments,id',
    ];

    protected function with(): array
    {
        return ['department'];
    }
}
