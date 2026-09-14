<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET /me/members` — the authenticated employee's own covered members (self/spouse/child/parent). */
class MyMembersController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $query = MediclaimMember::query()->where('employee_user_id', $actor->id);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        } else {
            // Default view excludes 'removed' rows — still queryable
            // explicitly via ?status=active,inactive,removed for history.
            $query->whereIn('status', ['active', 'inactive']);
        }

        return $this->ok($query->orderBy('relationship_type')->orderBy('full_name')->get());
    }
}
