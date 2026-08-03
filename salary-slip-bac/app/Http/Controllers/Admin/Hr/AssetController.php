<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Asset;
use App\Models\AssetAllocation;
use Illuminate\Http\Request;

class AssetController extends Controller
{
    use ScopesCompany;

    public function index(Request $request)
    {
        $query = Asset::with('activeAllocation.user');
        $this->applyCompanyScope($query, $request);

        if ($request->status) {
            $query->whereIn('status', explode(',', $request->status));
        }
        if ($request->category) {
            $query->whereIn('category', explode(',', $request->category));
        }
        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('asset_tag', 'like', '%' . $request->search . '%')
                  ->orWhere('serial_number', 'like', '%' . $request->search . '%')
                  ->orWhere('brand', 'like', '%' . $request->search . '%')
                  ->orWhere('model', 'like', '%' . $request->search . '%');
            });
        }

        $assets = $query->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $assets]);
    }

    public function dashboard(Request $request)
    {
        $query = Asset::query();
        $this->applyCompanyScope($query, $request);

        $counts = (clone $query)->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return response()->json(['status' => true, 'data' => [
            'assigned' => (int) ($counts['assigned'] ?? 0),
            'available' => (int) ($counts['available'] ?? 0),
            'returned' => (int) ($counts['returned'] ?? 0),
            'damaged' => (int) ($counts['damaged'] ?? 0),
            'lost' => (int) ($counts['lost'] ?? 0),
            'retired' => (int) ($counts['retired'] ?? 0),
            'total' => (clone $query)->count(),
        ]]);
    }

    public function show($id)
    {
        $asset = Asset::with(['allocations.user', 'allocations.allocatedBy'])->find($id);
        if (!$asset) {
            return response()->json(['status' => false, 'message' => 'Asset not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $asset]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'asset_tag' => 'required|string|max:100|unique:assets,asset_tag',
            'category' => 'required|string|max:100',
            'brand' => 'nullable|string|max:100',
            'model' => 'nullable|string|max:100',
            'serial_number' => 'nullable|string|max:150|unique:assets,serial_number',
            'purchase_date' => 'nullable|date',
            'purchase_cost' => 'nullable|numeric|min:0',
            'warranty_expiry' => 'nullable|date',
            'amc_expiry' => 'nullable|date',
            'condition' => 'nullable|in:new,good,fair,damaged',
            'notes' => 'nullable|string',
        ]);

        $context = $this->defaultCompanyContext($request);
        $asset = Asset::create($data + [
            'status' => 'available',
            'qr_code_value' => $data['asset_tag'],
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
        ]);

        return response()->json(['status' => true, 'message' => 'Asset added', 'data' => $asset], 201);
    }

    public function update(Request $request, $id)
    {
        $asset = Asset::find($id);
        if (!$asset) {
            return response()->json(['status' => false, 'message' => 'Asset not found'], 404);
        }

        $data = $request->validate([
            'category' => 'sometimes|required|string|max:100',
            'brand' => 'nullable|string|max:100',
            'model' => 'nullable|string|max:100',
            'serial_number' => 'nullable|string|max:150|unique:assets,serial_number,' . $asset->id,
            'purchase_date' => 'nullable|date',
            'purchase_cost' => 'nullable|numeric|min:0',
            'warranty_expiry' => 'nullable|date',
            'amc_expiry' => 'nullable|date',
            'condition' => 'nullable|in:new,good,fair,damaged',
            'status' => 'nullable|in:available,assigned,returned,damaged,lost,retired',
            'notes' => 'nullable|string',
        ]);

        $asset->update($data);

        return response()->json(['status' => true, 'message' => 'Asset updated', 'data' => $asset]);
    }

    public function destroy($id)
    {
        $asset = Asset::find($id);
        if (!$asset) {
            return response()->json(['status' => false, 'message' => 'Asset not found'], 404);
        }

        $asset->delete();

        return response()->json(['status' => true, 'message' => 'Asset deleted']);
    }

    public function allocate(Request $request, $id)
    {
        $asset = Asset::find($id);
        if (!$asset) {
            return response()->json(['status' => false, 'message' => 'Asset not found'], 404);
        }
        if ($asset->status !== 'available') {
            return response()->json(['status' => false, 'message' => 'Only available assets can be allocated'], 422);
        }

        $data = $request->validate([
            'user_id' => 'required|exists:users,id',
            'expected_return_at' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $allocation = AssetAllocation::create($data + [
            'asset_id' => $asset->id,
            'allocated_by' => auth('api')->id(),
            'allocated_at' => now(),
            'status' => 'active',
        ]);

        $asset->update(['status' => 'assigned']);

        return response()->json(['status' => true, 'message' => 'Asset allocated', 'data' => $allocation->load('user')], 201);
    }

    public function returnAsset(Request $request, $id)
    {
        $asset = Asset::find($id);
        if (!$asset) {
            return response()->json(['status' => false, 'message' => 'Asset not found'], 404);
        }

        $allocation = AssetAllocation::where('asset_id', $asset->id)->where('status', 'active')->latest('allocated_at')->first();
        if (!$allocation) {
            return response()->json(['status' => false, 'message' => 'No active allocation found for this asset'], 422);
        }

        $data = $request->validate([
            'return_condition' => 'nullable|in:new,good,fair,damaged',
            'notes' => 'nullable|string',
        ]);

        $allocation->update([
            'status' => 'returned',
            'returned_at' => now(),
            'return_condition' => $data['return_condition'] ?? null,
            'notes' => $data['notes'] ?? $allocation->notes,
        ]);

        $asset->update(['status' => ($data['return_condition'] ?? null) === 'damaged' ? 'damaged' : 'available']);

        return response()->json(['status' => true, 'message' => 'Asset returned', 'data' => $asset]);
    }

    public function transfer(Request $request, $id)
    {
        $asset = Asset::find($id);
        if (!$asset) {
            return response()->json(['status' => false, 'message' => 'Asset not found'], 404);
        }

        $data = $request->validate([
            'user_id' => 'required|exists:users,id',
            'notes' => 'nullable|string',
        ]);

        $current = AssetAllocation::where('asset_id', $asset->id)->where('status', 'active')->latest('allocated_at')->first();
        if ($current) {
            $current->update(['status' => 'transferred', 'returned_at' => now()]);
        }

        $allocation = AssetAllocation::create([
            'asset_id' => $asset->id,
            'user_id' => $data['user_id'],
            'allocated_by' => auth('api')->id(),
            'allocated_at' => now(),
            'status' => 'active',
            'notes' => $data['notes'] ?? null,
        ]);

        $asset->update(['status' => 'assigned']);

        return response()->json(['status' => true, 'message' => 'Asset transferred', 'data' => $allocation->load('user')], 201);
    }
}
