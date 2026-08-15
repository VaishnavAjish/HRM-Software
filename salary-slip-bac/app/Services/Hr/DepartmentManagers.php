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
        $managerIds = \App\Models\DepartmentManager::where('department_id', $department->id)->pluck('user_id');

        // Fallback to legacy reporting hierarchy if no explicit manager is assigned
        if ($managerIds->isEmpty()) {
            $employees = User::query()
                ->where('department', $department->name)
                ->where('is_deleted', 0)
                ->whereIn('status', ['0', 'ACTIVE']);
            $applyScope($employees);

            $employeeIds = $employees->pluck('id');
            if ($employeeIds->isNotEmpty()) {
                $managerIds = ReportingRelationship::query()
                    ->active()
                    ->primary()
                    ->inForceOn(now())
                    ->whereIn('employee_user_id', $employeeIds)
                    ->distinct()
                    ->pluck('manager_user_id');
            }
        }

        if ($managerIds->isEmpty()) {
            return collect();
        }

        $managers = User::query()->whereIn('id', $managerIds)
            ->where('is_deleted', 0)
            ->whereIn('status', ['0', 'ACTIVE']);

        // We do NOT apply company scope here because department managers
        // (especially in centralized departments like IT or HR) may belong
        // to a different company code (e.g. parent company) than the requisition.

        return $managers->orderBy('name')->get()->values();
    }

    public function isManagerOf(int $managerId, Department $department, callable $applyScope): bool
    {
        return $this->managersFor($department, $applyScope)
            ->contains(fn (User $manager) => (int) $manager->id === $managerId);
    }
}




