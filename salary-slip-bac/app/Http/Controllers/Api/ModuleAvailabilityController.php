<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\RequireModuleSchema;

/**
 * Reports which optional modules have their schema in place.
 *
 * The client needs this to decide what to put in the navigation. It cannot ask
 * the authorization platform, because that platform is itself one of the things
 * that may be absent — a menu that disappears whenever authorization is being
 * migrated is its own outage. This endpoint only probes for tables, so it
 * answers correctly no matter what state the RBAC tables are in.
 */
class ModuleAvailabilityController extends Controller
{
    public function index()
    {
        $modules = [];
        foreach (RequireModuleSchema::modules() as $module) {
            $modules[$module] = RequireModuleSchema::ready($module);
        }

        return response()->json([
            'success' => true,
            'data' => ['modules' => $modules],
        ]);
    }
}
