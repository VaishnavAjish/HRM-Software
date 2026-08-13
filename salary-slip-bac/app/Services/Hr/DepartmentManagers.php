<?php

namespace App\Services\Hr;

use App\Models\Department;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Tickets\ReportingHierarchy;
use Illuminate\Support\Collection;

class DepartmentManagers
{
    public function __construct(private readonly ReportingHierarchy $hierarchy)
    {
    }

    public function managersFor(Department $department, callable $applyScope): Collection
    {
        $employees = User::query()
            ->where('department', $department->name)
            ->where('is_deleted', 0)
            ->whereIn('status', ['0', 'ACTIVE']);
        $applyScope($employees);

        $employeeIds = $employees->pluck('id');
        if ($employeeIds->isEmpty()) {
            return collect();
        }

        $managerIds = ReportingRelationship::query()
            ->active()
            ->primary()
            ->inForceOn(now())
            ->whereIn('employee_user_id', $employeeIds)
            ->distinct()
            ->pluck('manager_user_id');
        if ($managerIds->isEmpty()) {
            return collect();
        }

        $managers = User::query()->whereIn('id', $managerIds);
        $applyScope($managers);

        return $managers->orderBy('name')->get()
            ->filter(fn (User $manager) => $this->hierarchy->isEligibleManager($manager))
            ->values();
    }

    public function isManagerOf(int $managerId, Department $department, callable $applyScope): bool
    {
        return $this->managersFor($department, $applyScope)
            ->contains(fn (User $manager) => (int) $manager->id === $managerId);
    }
}
