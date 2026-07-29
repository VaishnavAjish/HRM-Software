<?php

namespace App\Http\Controllers\Admin;

use App\Models\User;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class UserRoleController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->query('limit', 15);
        $search = $request->query('search');
        $roleFilter = $request->query('role');
        $roles = $roleFilter ? explode(',', $roleFilter) : [];

        $users = User::query()
            ->select('id', 'name', 'email', 'emp_code', 'department', 'status', 'role', 'type', 'company_code')
            ->where('is_deleted', 0)
            ->when($search, fn($q) => $q->where(function ($sub) use ($search) {
                $sub->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('emp_code', 'like', "%{$search}%");
            }))
            ->when($roles, function ($q) use ($roles) {
                $q->whereIn('role', $roles);
                // The `role` column alone doesn't reliably say "agent" — some
                // agent records carry role=1. Match RoleMiddleware's actual
                // definition (type === 'agent' OR role === 4) so an agent
                // never slips into an Admin/Super Admin listing.
                if (!in_array('4', $roles, true)) {
                    $q->where(function ($sub) {
                        $sub->whereNull('type')->orWhere('type', '!=', 'agent');
                    });
                }
            })
            ->orderBy('name')
            ->paginate($perPage);

        return response()->json([
            'status' => true,
            'data' => $users->items(),
            'meta' => [
                'total' => $users->total(),
                'page' => $users->currentPage(),
                'limit' => $users->perPage(),
                'totalPages' => $users->lastPage(),
            ],
        ]);
    }
}
