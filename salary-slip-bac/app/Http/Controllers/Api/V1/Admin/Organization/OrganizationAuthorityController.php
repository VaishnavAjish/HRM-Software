<?php

namespace App\Http\Controllers\Api\V1\Admin\Organization;

use App\Http\Controllers\Controller;
use App\Models\OrganizationAuthority;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrganizationAuthorityController extends Controller
{
    /**
     * Display a listing of organization authorities.
     */
    public function index(): JsonResponse
    {
        $authorities = OrganizationAuthority::query()
            ->orderBy('id', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $authorities,
        ]);
    }

    /**
     * Store a newly created authority in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'role' => ['sometimes', 'nullable', 'string', 'max:190'],
            'childIds' => ['sometimes', 'nullable', 'array'],
            'child_ids' => ['sometimes', 'nullable', 'array'],
        ]);

        $childIds = $validated['childIds'] ?? $validated['child_ids'] ?? [];

        $authority = OrganizationAuthority::create([
            'name' => mb_strtoupper(trim($validated['name'])),
            'role' => trim($validated['role'] ?? '') ?: 'Authority Parent',
            'child_ids' => $childIds,
        ]);

        return response()->json([
            'success' => true,
            'data' => $authority,
        ], 201);
    }

    /**
     * Display the specified authority.
     */
    public function show(int $id): JsonResponse
    {
        $authority = OrganizationAuthority::query()->find($id);

        if (! $authority) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'NOT_FOUND', 'message' => 'Authority not found.'],
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $authority,
        ]);
    }

    /**
     * Update the specified authority in storage.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $authority = OrganizationAuthority::query()->find($id);

        if (! $authority) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'NOT_FOUND', 'message' => 'Authority not found.'],
            ], 404);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:190'],
            'role' => ['sometimes', 'nullable', 'string', 'max:190'],
            'childIds' => ['sometimes', 'nullable', 'array'],
            'child_ids' => ['sometimes', 'nullable', 'array'],
        ]);

        if (isset($validated['name'])) {
            $authority->name = mb_strtoupper(trim($validated['name']));
        }
        if (array_key_exists('role', $validated)) {
            $authority->role = trim($validated['role'] ?? '') ?: 'Authority Parent';
        }
        if (array_key_exists('childIds', $validated) || array_key_exists('child_ids', $validated)) {
            $authority->child_ids = $validated['childIds'] ?? $validated['child_ids'] ?? [];
        }

        $authority->save();

        return response()->json([
            'success' => true,
            'data' => $authority,
        ]);
    }

    /**
     * Remove the specified authority from storage.
     */
    public function destroy(int $id): JsonResponse
    {
        $authority = OrganizationAuthority::query()->find($id);

        if (! $authority) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'NOT_FOUND', 'message' => 'Authority not found.'],
            ], 404);
        }

        $authority->delete();

        return response()->json([
            'success' => true,
            'data' => ['id' => $id],
        ]);
    }
}
