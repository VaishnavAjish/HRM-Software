<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ApprovalLevel;
use App\Models\AuditLog;
use App\Models\Department;
use App\Models\Location;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;

class RbacDashboardController extends Controller
{
    public function index(Request $request)
    {
        $totalUsers = User::count();
        $activeUsers = User::where('status', 0)->count();

        $usersByRole = Role::withCount('users')->orderByDesc('users_count')->get(['id', 'name'])
            ->map(fn($r) => ['name' => $r->name, 'count' => $r->users_count]);

        $usersByDepartment = User::selectRaw('department, COUNT(*) as total')
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->groupBy('department')
            ->get()
            ->map(fn($d) => ['name' => $d->department, 'count' => $d->total]);

        $recentActivity = AuditLog::with('user:id,name')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return response()->json([
            'status' => true,
            'data' => [
                'totalUsers' => $totalUsers,
                'activeUsers' => $activeUsers,
                'totalRoles' => Role::count(),
                'totalPermissions' => \App\Models\Permission::count(),
                'totalDepartments' => Department::count(),
                'totalLocations' => Location::count(),
                'pendingApprovals' => ApprovalLevel::count(),
                'usersByRole' => $usersByRole,
                'usersByDepartment' => $usersByDepartment,
                'recentActivity' => $recentActivity,
            ],
        ]);
    }
}
