<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\RequireModuleSchema;
use Illuminate\Support\Facades\DB;

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
    /**
     * The claim-review stages a Mediclaim claim cannot progress past without
     * a staffed decider. `MediclaimReviewerAssignment::ROLES` also contains
     * `settlement` — that role gates post-approval payout, not whether a
     * claim can be submitted and reviewed at all, so it is deliberately left
     * out of this rollout gate.
     */
    private const REQUIRED_REVIEWER_ROLES = ['coordinator', 'committee', 'hr_verification', 'director'];

    public function index()
    {
        $modules = [];
        foreach (RequireModuleSchema::modules() as $module) {
            $modules[$module] = RequireModuleSchema::ready($module);
        }

        // Mediclaim needs more than migrated tables before it is genuinely
        // usable: schema readiness only proves the tables exist, not that
        // anyone is staffed to review a claim or that a rule book has been
        // published. Folded directly into modules['mediclaim'] — instead of
        // exposing that only through the separate mediclaim_ready flag below
        // — because useModuleAvailability().isAvailable() on the frontend
        // reads nothing but modules[name] !== false, and this is a
        // backend-only phase: keeping the nav/route gate correct through the
        // one signal it already checks avoids any frontend edit.
        $mediclaimReady = $modules['mediclaim'] ?? false;
        if ($mediclaimReady) {
            $mediclaimReady = $this->mediclaimRolloutReady();
        }
        $modules['mediclaim'] = $mediclaimReady;

        return response()->json([
            'success' => true,
            'data' => [
                'modules' => $modules,
                'mediclaim_ready' => $mediclaimReady,
            ],
        ]);
    }

    /**
     * True once Mediclaim is staffed and documented enough to actually run a
     * claim through, not merely migrated: a published rule book exists, and
     * at least one company has an active, primary (non-backup) reviewer
     * assigned to every required stage.
     *
     * Only called once RequireModuleSchema::ready('mediclaim') is already
     * true, so the mediclaim_* tables are known to exist here.
     */
    private function mediclaimRolloutReady(): bool
    {
        // MediclaimRuleBook::STATUSES = ['draft', 'published', 'archived'].
        $hasPublishedRuleBook = DB::table('mediclaim_rule_books')
            ->where('status', 'published')
            ->exists();

        if (! $hasPublishedRuleBook) {
            return false;
        }

        $today = now()->toDateString();

        // MediclaimReviewerAssignment::STATUSES = ['active', 'inactive'].
        // is_backup=false per that model's own docblock: "the module stays
        // hidden from the frontend nav (mediclaim_ready) until at least one
        // active, non-backup row exists per required role per company."
        $rows = DB::table('mediclaim_reviewer_assignments')
            ->where('status', 'active')
            ->where('is_backup', false)
            ->where('active_from', '<=', $today)
            ->where(function ($query) use ($today) {
                $query->whereNull('active_to')->orWhere('active_to', '>=', $today);
            })
            ->whereIn('role', self::REQUIRED_REVIEWER_ROLES)
            ->get(['company_code', 'role']);

        $rolesByCompany = [];
        foreach ($rows as $row) {
            $rolesByCompany[$row->company_code][$row->role] = true;
        }

        foreach ($rolesByCompany as $roles) {
            if (count($roles) === count(self::REQUIRED_REVIEWER_ROLES)) {
                return true;
            }
        }

        return false;
    }
}
