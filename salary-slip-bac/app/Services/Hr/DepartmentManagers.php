<?php

namespace App\Services\Hr;

use App\Models\Department;
use App\Models\DepartmentManager;
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
        $managerIds = DepartmentManager::where('department_id', $department->id)->pluck('user_id');

        if ($managerIds->isEmpty()) {
            return collect();
        }

        $managers = User::query()->whereIn('id', $managerIds)
            ->where('is_deleted', 0)
            ->whereIn('status', ['0', 'ACTIVE']);

        return $managers->orderBy('name')->get()->values();
    }

    public function isManagerOf(int $managerId, Department $department, callable $applyScope): bool
    {
        return $this->managersFor($department, $applyScope)
            ->contains(fn (User $manager) => (int) $manager->id === $managerId);
    }
}
