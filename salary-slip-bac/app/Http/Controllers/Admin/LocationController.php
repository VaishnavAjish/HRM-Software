<?php

namespace App\Http\Controllers\Admin;

use App\Models\Location;

class LocationController extends BaseResourceController
{
    protected string $model = Location::class;
    protected string $moduleName = 'Location';
    protected array $rules = [
        'name' => 'required|string',
        'type' => 'nullable|string',
        'country' => 'nullable|string',
        'state' => 'nullable|string',
        'city' => 'nullable|string',
    ];
}
