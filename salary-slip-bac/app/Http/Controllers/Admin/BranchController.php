<?php

namespace App\Http\Controllers\Admin;

use App\Models\Branch;

class BranchController extends BaseResourceController
{
    protected string $model = Branch::class;
    protected string $moduleName = 'Branch';
    protected array $rules = [
        'name' => 'required|string',
        'code' => 'required|string|unique:branches,code',
        'location_id' => 'nullable|integer|exists:locations,id',
    ];

    protected function with(): array
    {
        return ['location'];
    }
}
