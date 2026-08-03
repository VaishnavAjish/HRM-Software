<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Services\Authorization\AuthorizationCache;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PermissionController extends Controller
{
    public function __construct(private readonly AuthorizationCache $cache)
    {
    }

    public function index(Request $request)
    {
        $query = Permission::with('group')->orderBy('code');
        if ($search = trim((string) $request->query('search'))) {
            $query->where(fn ($q) => $q->where('code', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%"));
        }
        if ($resource = $request->query('resource')) {
            $query->where('resource', $resource);
        }
        return response()->json(['success' => true, 'data' => $query->paginate(min(100, max(1, (int) $request->query('limit', 25))))]);
    }

    public function store(Request $request)
    {
        $permission = Permission::create($this->validated($request));
        $this->cache->invalidate();
        return response()->json(['success' => true, 'data' => $permission], 201);
    }

    public function update(Request $request, Permission $permission)
    {
        $permission->update($this->validated($request, $permission));
        $this->cache->invalidate();
        return response()->json(['success' => true, 'data' => $permission->fresh()]);
    }

    private function validated(Request $request, ?Permission $permission = null): array
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:190', 'regex:/^[a-z0-9]+(?:[._][a-z0-9]+)*$/', Rule::unique('permissions', 'code')->ignore($permission?->id)],
            'resource' => ['required', 'string', 'max:150'],
            'action' => ['required', 'string', 'max:64', 'regex:/^[a-z][a-z0-9_]*$/'],
            'level' => ['required', Rule::in(['APPLICATION', 'UI', 'ACTION', 'ROW', 'FIELD', 'WORKFLOW', 'ADMINISTRATION'])],
            'description' => ['nullable', 'string', 'max:500'],
            'group_id' => ['nullable', 'exists:permission_groups,id'],
            'is_sensitive' => ['boolean'],
            'is_active' => ['boolean'],
        ]);
        $data['name'] = $data['code'];
        return $data;
    }
}
