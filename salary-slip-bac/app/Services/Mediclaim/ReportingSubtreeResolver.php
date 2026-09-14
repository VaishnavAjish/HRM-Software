<?php

namespace App\Services\Mediclaim;

use App\Models\ReportingRelationship;
use Illuminate\Support\Carbon;

/**
 * Resolves everyone under a manager — the downward mirror of
 * `App\Services\Tickets\ReportingHierarchy`'s upward `chainFor()` walk, which
 * this class deliberately mirrors in style: an in-memory `$seen` map for
 * cycle detection and a hard `MAX_DEPTH` cap, no SQL recursive CTE (none
 * exist anywhere in this codebase, and the companies in scope are small).
 *
 * No downward walk existed anywhere in this codebase before this class.
 *
 * Used only by live team-visibility reads (`GET /team/claims`,
 * `GET /team/pending-approvals`) — never to authorize a decision on an
 * already-assigned claim. Deciding a claim checks
 * `claim.assigned_manager_id === actor.id` directly (see
 * ClaimWorkflowService::managerDecision()), because that assignment is a
 * point-in-time snapshot and must not silently re-resolve against whoever
 * happens to manage the subtree *today*.
 */
class ReportingSubtreeResolver
{
    /**
     * Same rationale as ReportingHierarchy::MAX_DEPTH: the cycle guard below
     * already prevents an infinite loop, this is the second line of defence
     * against a pathological chain turning one query into an unbounded sweep.
     */
    public const MAX_DEPTH = 20;

    /**
     * Every user id anywhere beneath `$managerId`, nearest reports first,
     * discovered level-by-level (BFS) rather than one query per branch.
     *
     * @return list<int>
     */
    public function subtreeUserIds(int $managerId, ?Carbon $asOf = null): array
    {
        $asOf ??= now();

        $seen = [$managerId => true];
        $frontier = [$managerId];
        $result = [];

        for ($depth = 0; $depth < self::MAX_DEPTH && $frontier !== []; $depth++) {
            $reports = ReportingRelationship::query()
                ->active()
                ->primary()
                ->inForceOn($asOf)
                ->whereIn('manager_user_id', $frontier)
                ->pluck('employee_user_id');

            $next = [];

            foreach ($reports as $employeeId) {
                $employeeId = (int) $employeeId;

                // Cycle guard: a line edited directly in the database (or
                // predating a validation that now prevents it) must not hang
                // this sweep the same way ReportingHierarchy::chainFor()
                // refuses to hang walking upward.
                if (isset($seen[$employeeId])) {
                    continue;
                }

                $seen[$employeeId] = true;
                $result[] = $employeeId;
                $next[] = $employeeId;
            }

            $frontier = $next;
        }

        return $result;
    }

    /** True when `$employeeId` sits anywhere beneath `$managerId`. */
    public function isInSubtree(int $managerId, int $employeeId, ?Carbon $asOf = null): bool
    {
        return in_array($employeeId, $this->subtreeUserIds($managerId, $asOf), true);
    }
}
