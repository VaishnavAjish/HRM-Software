<?php

namespace App\Http\Controllers;

use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Tickets\ReportingHierarchy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Read and edit the employee reporting lines that ticket escalation walks.
 *
 * Until this existed the hierarchy could only be seeded or written by hand,
 * which made the escalation chain effectively fixed. Every write goes through
 * ReportingHierarchy::validateAssignment so the self / inactive / cross-company
 * / circular guards apply here exactly as they do anywhere else.
 *
 * Nothing is ever hard-deleted: ending a reporting line closes the current row
 * and opens no new one, leaving the history of who reported to whom intact for
 * tickets that were routed under it.
 */
class ReportingHierarchyController extends Controller
{
    public function __construct(private readonly ReportingHierarchy $hierarchy)
    {
    }

    private function actor(): ?User
    {
        return auth('api')->user();
    }

    /**
     * Restrict a user query to the companies the caller can administer.
     *
     * Super Admins see everyone. Everybody else sees their own companies, with
     * the same comma-list and wildcard convention Ticket::scopeVisibleTo uses —
     * a multi-company admin must not lose half their staff to a string compare.
     */
    private function scopeToCaller($query, ?User $actor)
    {
        if (! $actor || (int) $actor->role === 0) {
            return $query;
        }

        $companies = array_values(array_filter(array_map(
            'trim',
            explode(',', (string) $actor->company_code)
        )));

        if (array_intersect(['all', 'all-companies'], $companies) || $companies === []) {
            return $query;
        }

        return $query->where(function ($q) use ($companies) {
            foreach ($companies as $code) {
                $q->orWhere('company_code', 'like', '%'.$code.'%');
            }
        });
    }

    /** A user the caller is allowed to touch, or null. */
    private function findInScope(int $id): ?User
    {
        return $this->scopeToCaller(
            User::query()->where('is_deleted', 0),
            $this->actor()
        )->find($id);
    }

    private static function summarise(?User $user): ?array
    {
        if (! $user) {
            return null;
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
            'emp_code' => $user->emp_code,
            'email' => $user->email,
            'role' => (int) $user->role,
            'department' => $user->department,
            'designation' => $user->designation,
            'company_code' => $user->company_code,
            'unit' => $user->unit,
        ];
    }

    /**
     * Everyone in scope with their current manager.
     *
     * Employees without a manager are the point of the screen — they are the
     * ones whose tickets route straight to a Super Admin — so they are listed
     * rather than filtered out, and `unassigned=1` narrows to just them.
     */
    public function index(Request $request)
    {
        $actor = $this->actor();

        $query = $this->scopeToCaller(User::query()->where('is_deleted', 0), $actor);

        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->where('name', 'like', $like)
                    ->orWhere('emp_code', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('department', 'like', $like);
            });
        }

        if ($department = trim((string) $request->query('department', ''))) {
            $query->where('department', $department);
        }

        $limit = min(max((int) $request->query('limit', 25), 1), 200);

        $users = $query->orderBy('name')->paginate($limit);

        $managers = ReportingRelationship::query()
            ->active()
            ->primary()
            ->inForceOn(now())
            ->whereIn('employee_user_id', $users->pluck('id'))
            ->with('manager')
            ->get()
            ->keyBy('employee_user_id');

        $rows = collect($users->items())
            ->map(function (User $user) use ($managers) {
                $relationship = $managers->get($user->id);

                return array_merge(self::summarise($user), [
                    'manager' => self::summarise($relationship?->manager),
                    'reporting_since' => $relationship?->effective_from,
                ]);
            })
            ->values();

        if ($request->boolean('unassigned')) {
            $rows = $rows->filter(fn ($row) => $row['manager'] === null)->values();
        }

        return response()->json([
            'status' => true,
            'data' => $rows,
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ],
        ]);
    }

    /**
     * One employee's full escalation chain, as tickets raised today would use.
     *
     * This is deliberately the live chain and not a ticket's stored snapshot:
     * the screen is for checking what the hierarchy *will* do, while a ticket
     * keeps the chain that existed when it was raised.
     */
    public function show(int $id)
    {
        $employee = $this->findInScope($id);

        if (! $employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found.'], 404);
        }

        $chain = $this->hierarchy->snapshotFor($employee);

        return response()->json([
            'status' => true,
            'data' => [
                'employee' => self::summarise($employee),
                'manager' => self::summarise($this->hierarchy->managerFor($employee)),
                'chain' => $chain,
                'history' => ReportingRelationship::query()
                    ->where('employee_user_id', $employee->id)
                    ->with('manager')
                    ->orderByDesc('effective_from')
                    ->orderByDesc('id')
                    ->limit(50)
                    ->get()
                    ->map(fn (ReportingRelationship $row) => [
                        'id' => $row->id,
                        'manager' => self::summarise($row->manager),
                        'status' => $row->status,
                        'effective_from' => $row->effective_from,
                        'effective_to' => $row->effective_to,
                        'reason' => $row->reason,
                    ]),
            ],
        ]);
    }

    /**
     * Who may be set as this employee's manager.
     *
     * Filtered through the same validateAssignment the write path uses, so the
     * list cannot offer a choice the save would then reject.
     */
    public function candidates(int $id)
    {
        $employee = $this->findInScope($id);

        if (! $employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found.'], 404);
        }

        $candidates = User::query()
            ->where('is_deleted', 0)
            ->whereIn('role', [0, 1, 2])
            ->where('id', '!=', $employee->id)
            ->orderBy('name')
            ->get()
            ->filter(fn (User $user) => $this->hierarchy->validateAssignment($employee, $user) === null)
            ->map(fn (User $user) => self::summarise($user))
            ->values();

        return response()->json(['status' => true, 'data' => $candidates]);
    }

    /**
     * Set (or replace) an employee's primary reporting manager.
     *
     * The previous line is closed rather than overwritten, and both writes share
     * a transaction so the partial unique index can never see two active primary
     * rows for the same employee.
     */
    public function update(Request $request, int $id)
    {
        $employee = $this->findInScope($id);

        if (! $employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found.'], 404);
        }

        $data = $request->validate([
            'manager_user_id' => ['required', 'integer'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $manager = User::where('is_deleted', 0)->find($data['manager_user_id']);

        if (! $manager) {
            return response()->json(['status' => false, 'message' => 'Manager not found.'], 404);
        }

        $problem = $this->hierarchy->validateAssignment($employee, $manager);

        if ($problem !== null) {
            return response()->json(['status' => false, 'message' => $problem], 422);
        }

        $actor = $this->actor();

        DB::transaction(function () use ($employee, $manager, $data, $actor) {
            ReportingRelationship::query()
                ->where('employee_user_id', $employee->id)
                ->where('relationship_type', ReportingRelationship::TYPE_PRIMARY)
                ->where('status', ReportingRelationship::STATUS_ACTIVE)
                ->update([
                    'status' => ReportingRelationship::STATUS_ENDED,
                    'effective_to' => now(),
                    'updated_at' => now(),
                ]);

            ReportingRelationship::create([
                'employee_user_id' => $employee->id,
                'manager_user_id' => $manager->id,
                'relationship_type' => ReportingRelationship::TYPE_PRIMARY,
                'status' => ReportingRelationship::STATUS_ACTIVE,
                'effective_from' => now(),
                'reason' => $data['reason'] ?? null,
                'created_by' => $actor?->id,
            ]);
        });

        return response()->json([
            'status' => true,
            'message' => "{$employee->name} now reports to {$manager->name}.",
            'data' => [
                'employee' => self::summarise($employee),
                'manager' => self::summarise($manager),
                'chain' => $this->hierarchy->snapshotFor($employee->fresh()),
            ],
        ]);
    }

    /**
     * End an employee's reporting line without putting a new one in its place.
     *
     * Their tickets then route straight to the final authority, which is the
     * correct behaviour for someone who genuinely has no manager.
     */
    public function destroy(Request $request, int $id)
    {
        $employee = $this->findInScope($id);

        if (! $employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found.'], 404);
        }

        $ended = ReportingRelationship::query()
            ->where('employee_user_id', $employee->id)
            ->where('relationship_type', ReportingRelationship::TYPE_PRIMARY)
            ->where('status', ReportingRelationship::STATUS_ACTIVE)
            ->update([
                'status' => ReportingRelationship::STATUS_ENDED,
                'effective_to' => now(),
                'reason' => $request->input('reason'),
                'updated_at' => now(),
            ]);

        return response()->json([
            'status' => true,
            'message' => $ended
                ? "{$employee->name} no longer has a reporting manager."
                : "{$employee->name} had no reporting manager to remove.",
        ]);
    }
}
