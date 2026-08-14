<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\JobRequisition;
use Illuminate\Http\Request;

class PublicJobController extends Controller
{
    public function index(Request $request)
    {
        $query = JobRequisition::query()
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('target_closing_date')
                    ->orWhere('target_closing_date', '>=', now()->toDateString());
            })
            ->with(['department:id,name', 'departmentManager:id,name,designation']);

        if ($request->company_code) {
            $query->where('company_code', $request->company_code);
        }

        if ($request->department_id) {
            $query->where('department_id', $request->department_id);
        }

        if ($request->employment_type) {
            $query->where('employment_type', $request->employment_type);
        }

        if ($request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('designation', 'like', "%{$search}%");
            });
        }

        $jobs = $query->orderByDesc('posted_at')->orderByDesc('id')->paginate($request->per_page ?? 20);

        return response()->json(['status' => true, 'data' => $jobs]);
    }

    public function show(Request $request, $slug)
    {
        $query = JobRequisition::query()
            ->where('status', 'published')
            ->with(['department:id,name', 'departmentManager:id,name,designation']);

        if (is_numeric($slug)) {
            $job = $query->where('id', $slug)->first();
        } else {
            $job = $query->where('id', $slug)->orWhere('title', str_replace('-', ' ', $slug))->first();
        }

        if (! $job) {
            return response()->json(['status' => false, 'message' => 'Job listing not found or no longer active.'], 404);
        }

        return response()->json(['status' => true, 'data' => $job]);
    }
}
