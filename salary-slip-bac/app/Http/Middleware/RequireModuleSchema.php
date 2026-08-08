<?php

namespace App\Http\Middleware;

use App\Services\Authorization\SchemaSupport;
use Closure;
use Illuminate\Http\Request;

/**
 * Refuses a module whose tables are not in the database.
 *
 * The HR module shipped its UI, routes and controllers ahead of its migration.
 * `php artisan migrate` is blocked by an unrecorded authorization migration, so
 * the thirteen HR tables never landed while the thirty-six routes that query
 * them stayed registered. The permission gate does not catch this: no `hr.*`
 * code exists, so the engine denies, shadow mode rescues the deny, and the
 * legacy check returns `'admin' => true`. The request reaches the controller
 * and fails on a missing relation — a 500 with a SQL string in it, on a menu
 * item every admin can see.
 *
 * This runs ahead of `permission:` deliberately. Whether a feature exists is
 * not a fact about the caller, and answering it first stops an unavailable
 * module from reading as an authorization failure. Same reasoning, and the same
 * response shape, as RequirePermission's AUTHORIZATION_SCHEMA_NOT_READY branch
 * and the Node `schemaGate`, so the React client's existing handling applies
 * unchanged.
 */
class RequireModuleSchema
{
    /**
     * Tables a module cannot serve a single route without.
     *
     * @var array<string, list<string>>
     */
    private const MODULES = [
        'hr' => [
            'job_requisitions',
            'candidates',
            'candidate_stage_history',
            'interviews',
            'interview_panelists',
            'interview_feedback',
            'offers',
            'offer_revisions',
            'assets',
            'asset_allocations',
            'performance_cycles',
            'performance_goals',
            'performance_reviews',
        ],
        'tickets' => [
            'ticket_categories',
            'tickets',
            'ticket_messages',
            'ticket_activity_logs',
            // The dashboard and queue read the SLA columns that land with this
            // table, so a deployment stopped between the two ticket migrations
            // must report "being set up" rather than 500 on every card.
            'ticket_sla_rules',
        ],
        'notifications' => [
            'notifications',
        ],
    ];

    public function handle(Request $request, Closure $next, string $module)
    {
        if (self::ready($module)) {
            return $next($request);
        }

        return response()->json([
            'success' => false,
            'error' => [
                'code' => 'MODULE_SCHEMA_NOT_READY',
                'message' => 'This module is being set up and is not available yet.',
                'module' => $module,
            ],
        ], 503);
    }

    /**
     * True when every table the module needs is present.
     *
     * An unknown module name is treated as ready: this middleware exists to
     * catch absent schema, not to become a second place a route can be
     * switched off by typo.
     */
    public static function ready(string $module): bool
    {
        $required = self::MODULES[$module] ?? null;
        if ($required === null) {
            return true;
        }

        foreach ($required as $table) {
            if (!SchemaSupport::hasTable($table)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Module names this middleware knows about.
     *
     * @return list<string>
     */
    public static function modules(): array
    {
        return array_keys(self::MODULES);
    }
}
