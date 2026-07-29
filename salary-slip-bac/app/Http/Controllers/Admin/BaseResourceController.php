<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AuditLogger;
use Illuminate\Http\Request;

/**
 * Shared CRUD for the small lookup-style RBAC resources (Locations, Branches,
 * Teams, Approval Levels) so each one doesn't need its own copy of the same
 * index/store/update/destroy logic.
 */
abstract class BaseResourceController extends Controller
{
    protected string $model;
    protected array $rules;
    protected string $moduleName;
    protected string $orderByColumn = 'name';

    public function index(Request $request)
    {
        $items = $this->model::with($this->with())->orderBy($this->orderByColumn)->get();
        return response()->json(['status' => true, 'data' => $items]);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules);
        $item = $this->model::create($data);

        AuditLogger::log($request, 'CREATE', $this->moduleName, null, $item->toArray());

        return response()->json(['status' => true, 'message' => $this->moduleName . ' created', 'data' => $item]);
    }

    public function update(Request $request, $id)
    {
        $item = $this->model::find($id);
        if (!$item) {
            return response()->json(['status' => false, 'message' => $this->moduleName . ' not found'], 404);
        }

        $data = $request->validate($this->rules);
        $before = $item->toArray();
        $item->update($data);

        AuditLogger::log($request, 'UPDATE', $this->moduleName, $before, $item->fresh()->toArray());

        return response()->json(['status' => true, 'message' => $this->moduleName . ' updated', 'data' => $item]);
    }

    public function destroy(Request $request, $id)
    {
        $item = $this->model::find($id);
        if (!$item) {
            return response()->json(['status' => false, 'message' => $this->moduleName . ' not found'], 404);
        }

        $before = $item->toArray();
        $item->delete();

        AuditLogger::log($request, 'DELETE', $this->moduleName, $before, null);

        return response()->json(['status' => true, 'message' => $this->moduleName . ' deleted']);
    }

    protected function with(): array
    {
        return [];
    }
}
