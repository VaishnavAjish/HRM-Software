<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\DepartmentManager;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        $query = Department::with(["managers:id,name,emp_code,email,designation,department", "manager:id,name,emp_code,email,designation,department"]);

        if ($request->filled("company_code") && $request->company_code !== "ALL") {
            $companyCode = $request->company_code;
            $query->where(function($q) use ($companyCode) {
                $q->where("company_code", $companyCode)
                  ->orWhere("company_code", "LIKE", "%,{$companyCode},%")
                  ->orWhere("company_code", "LIKE", "{$companyCode},%")
                  ->orWhere("company_code", "LIKE", "%,{$companyCode}");
            });
        }

        if ($request->filled("search")) {
            $search = $request->search;
            $query->where("name", "LIKE", "%{$search}%");
        }

        return response()->json([
            "status" => true,
            "data" => $query->orderBy("name")->get()
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            "name" => "required|string|max:255",
            "company_code" => "nullable|string|max:255",
            "manager_id" => "nullable|exists:users,id"
        ]);

        if ($validator->fails()) {
            return response()->json([
                "status" => false,
                "message" => $validator->errors()->first(),
                "errors" => $validator->errors()
            ], 422);
        }

        $data = $validator->validated();
        $department = Department::create($data);

        if (!empty($data["manager_id"])) {
            DepartmentManager::firstOrCreate([
                "department_id" => $department->id,
                "user_id" => $data["manager_id"]
            ]);
        }

        return response()->json([
            "status" => true,
            "message" => "Department created successfully",
            "data" => $department->load(["managers:id,name,emp_code,email,designation,department", "manager:id,name,emp_code,email,designation,department"])
        ]);
    }

    public function update(Request $request, $id)
    {
        $department = Department::find($id);

        if (!$department) {
            return response()->json(["status" => false, "message" => "Department not found"], 404);
        }

        $validator = Validator::make($request->all(), [
            "name" => "required|string|max:255",
            "company_code" => "nullable|string|max:255",
            "manager_id" => "nullable|exists:users,id"
        ]);

        if ($validator->fails()) {
            return response()->json([
                "status" => false,
                "message" => $validator->errors()->first(),
                "errors" => $validator->errors()
            ], 422);
        }

        $data = $validator->validated();
        $department->update($data);

        return response()->json([
            "status" => true,
            "message" => "Department updated successfully",
            "data" => $department->load(["managers:id,name,emp_code,email,designation,department", "manager:id,name,emp_code,email,designation,department"])
        ]);
    }

    public function destroy($id)
    {
        $department = Department::find($id);

        if (!$department) {
            return response()->json(["status" => false, "message" => "Department not found"], 404);
        }

        $department->delete();

        return response()->json([
            "status" => true,
            "message" => "Department deleted successfully"
        ]);
    }

    /**
     * List all assigned department managers and the departments they manage.
     */
    public function managers(Request $request)
    {
        $managerUserIds = DepartmentManager::query()->distinct()->pluck("user_id");

        $usersQuery = User::query()
            ->whereIn("id", $managerUserIds)
            ->where("is_deleted", 0)
            ->select(["id", "name", "emp_code", "email", "designation", "department", "company_code", "status"]);

        if ($request->filled("search")) {
            $search = $request->search;
            $usersQuery->where(function ($q) use ($search) {
                $q->where("name", "LIKE", "%{$search}%")
                  ->orWhere("emp_code", "LIKE", "%{$search}%")
                  ->orWhere("email", "LIKE", "%{$search}%");
            });
        }

        $users = $usersQuery->orderBy("name")->get();

        $allMappings = DepartmentManager::query()
            ->join("departments", "department_managers.department_id", "=", "departments.id")
            ->select([
                "department_managers.id as mapping_id",
                "department_managers.user_id",
                "departments.id as department_id",
                "departments.name as department_name",
                "departments.company_code as department_company_code"
            ])
            ->get()
            ->groupBy("user_id");

        $result = $users->map(function ($user) use ($allMappings) {
            $depts = $allMappings->get($user->id, collect())->map(function ($row) {
                return [
                    "id" => $row->department_id,
                    "name" => $row->department_name,
                    "company_code" => $row->department_company_code,
                    "mapping_id" => $row->mapping_id
                ];
            })->values();

            return [
                "id" => $user->id,
                "name" => $user->name,
                "emp_code" => $user->emp_code,
                "email" => $user->email,
                "designation" => $user->designation,
                "company_code" => $user->company_code,
                "status" => $user->status,
                "departments" => $depts,
                "department_count" => $depts->count()
            ];
        });

        if ($request->filled("company_code") && $request->company_code !== "ALL") {
            $companyCode = $request->company_code;
            $result = $result->filter(function ($item) use ($companyCode) {
                if ($item["company_code"] === $companyCode) return true;
                foreach ($item["departments"] as $d) {
                    if ($d["company_code"] === $companyCode) return true;
                }
                return false;
            })->values();
        }

        return response()->json([
            "status" => true,
            "data" => $result
        ]);
    }

    /**
     * Get eligible users who can be assigned as department managers.
     */
    public function eligibleUsers(Request $request)
    {
        $query = User::query()
            ->where("is_deleted", 0)
            ->whereIn("status", ["0", "ACTIVE", 0])
            ->select(["id", "name", "emp_code", "email", "designation", "department", "company_code"]);

        if ($request->filled("company_code") && $request->company_code !== "ALL") {
            $query->where(function($q) use ($request) {
                $q->where("company_code", "LIKE", "%{$request->company_code}%")
                  ->orWhereNull("company_code")
                  ->orWhere("company_code", "");
            });
        }

        if ($request->filled("search")) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where("name", "LIKE", "%{$search}%")
                  ->orWhere("emp_code", "LIKE", "%{$search}%")
                  ->orWhere("email", "LIKE", "%{$search}%");
            });
        }

        return response()->json([
            "status" => true,
            "data" => $query->orderBy("name")->limit(100)->get()
        ]);
    }

    /**
     * Assign / update departments for a manager.
     */
    public function assignManager(Request $request)
    {
        $validator = Validator::make($request->all(), [
            "user_id" => "required|exists:users,id",
            "department_ids" => "required|array",
            "department_ids.*" => "exists:departments,id"
        ]);

        if ($validator->fails()) {
            return response()->json([
                "status" => false,
                "message" => $validator->errors()->first(),
                "errors" => $validator->errors()
            ], 422);
        }

        $userId = $request->user_id;
        $departmentIds = $request->department_ids;

        DB::transaction(function () use ($userId, $departmentIds) {
            // Delete old assignments
            DepartmentManager::where("user_id", $userId)->delete();

            // Insert new assignments
            foreach ($departmentIds as $deptId) {
                DepartmentManager::create([
                    "user_id" => $userId,
                    "department_id" => $deptId
                ]);
            }
        });

        return response()->json([
            "status" => true,
            "message" => "Department manager assigned successfully"
        ]);
    }

    /**
     * Remove all department manager assignments for a user.
     */
    public function removeManager($userId, Request $request)
    {
        $query = DepartmentManager::where("user_id", $userId);

        if ($request->filled("department_id")) {
            $query->where("department_id", $request->department_id);
        }

        $query->delete();

        return response()->json([
            "status" => true,
            "message" => "Department manager removed successfully"
        ]);
    }

    public function seedLegacy(Request $request)
    {
        $users = \Illuminate\Support\Facades\DB::table('users')
            ->select('department', 'company_code')
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->distinct()
            ->get();
            
        $imported = 0;
        foreach ($users as $user) {
            $deptName = trim($user->department);
            $companyCode = $user->company_code ? trim($user->company_code) : null;
            if (!$deptName) continue;
            
            $existing = \Illuminate\Support\Facades\DB::table('departments')
                ->where('name', $deptName);
                
            if ($companyCode) {
                $existing->where('company_code', $companyCode);
            } else {
                $existing->whereNull('company_code');
            }
            
            if (!$existing->first()) {
                Department::create(['name' => $deptName, 'company_code' => $companyCode]);
                $imported++;
            }
        }
        return response()->json(['status' => true, 'message' => "Imported $imported departments"]);
    }
}

