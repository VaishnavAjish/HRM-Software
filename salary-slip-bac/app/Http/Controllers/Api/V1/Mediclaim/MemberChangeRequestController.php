<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimMemberChangeRequest;
use App\Services\Mediclaim\MediclaimMemberService;
use App\Services\Mediclaim\PolicyEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * `GET,POST /me/member-change-requests` — self-service: an employee submits
 * an add/update/remove request against their own covered members. Applied
 * immediately (no HR approval wait — see `MediclaimMemberService::
 * submitAndAutoApply()`); still never a direct-edit path onto
 * `mediclaim_members` itself, and every eligibility rule (max children, age
 * limits, spouse overlap) still runs server-side on every submission.
 *
 * Accepts either the frontend's actual camelCase payload
 * (`requestType`/`memberId`/`proposedValues.{name,relationshipType,
 * dateOfBirth,gender}`) or snake_case, and normalizes enum values
 * (request/relationship type) to lowercase regardless of the casing the
 * caller sent them in, since the frontend's own constants are uppercase for
 * display purposes.
 */
class MemberChangeRequestController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(
        private readonly MediclaimMemberService $service,
        private readonly PolicyEligibilityService $eligibility,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $query = MediclaimMemberChangeRequest::query()
            ->where('employee_user_id', $actor->id)
            ->with(['member', 'decidedBy:id,name,email']);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $requestType = strtolower((string) ($request->input('requestType') ?? $request->input('request_type')));
        if (! in_array($requestType, MediclaimMemberChangeRequest::REQUEST_TYPES, true)) {
            throw ValidationException::withMessages(['requestType' => 'requestType must be one of: add, update, remove.']);
        }

        $proposedValuesRaw = (array) ($request->input('proposedValues') ?? $request->input('proposed_values') ?? []);
        $memberId = $request->input('memberId') ?? $request->input('member_id');

        if (in_array($requestType, ['update', 'remove'], true) && ! $memberId) {
            throw ValidationException::withMessages(['memberId' => 'memberId is required for an update or remove request.']);
        }

        $proposedValues = [];
        if ($requestType !== 'remove') {
            $relationshipType = strtolower((string) (
                $proposedValuesRaw['relationshipType']
                ?? $proposedValuesRaw['relationship_type']
                ?? $request->input('relationshipType')
                ?? $request->input('relationship_type')
                ?? ''
            ));

            $proposedValues = [
                'full_name' => $proposedValuesRaw['name'] ?? $proposedValuesRaw['full_name'] ?? null,
                'relationship_type' => $relationshipType ?: null,
                'date_of_birth' => $proposedValuesRaw['dateOfBirth'] ?? $proposedValuesRaw['date_of_birth'] ?? null,
                'gender' => $proposedValuesRaw['gender'] ?? null,
            ];

            if (! $proposedValues['full_name']) {
                throw ValidationException::withMessages(['proposedValues.name' => 'Member name is required.']);
            }
            if (! in_array($proposedValues['relationship_type'], MediclaimMember::RELATIONSHIP_TYPES, true)) {
                throw ValidationException::withMessages(['proposedValues.relationshipType' => 'relationshipType must be one of: ' . implode(', ', MediclaimMember::RELATIONSHIP_TYPES)]);
            }
        }

        // Kept purely for record-keeping (there's no schema column for it,
        // and no HR reviewer reads it in the auto-apply flow) — folded into
        // proposed_values so it's still visible in the request's audit trail.
        $reason = trim((string) ($request->input('reason') ?? ''));
        if ($reason !== '') {
            $proposedValues['employee_reason'] = $reason;
        }

        $data = [
            'request_type' => $requestType,
            'enrollment_id' => $request->input('enrollmentId') ?? $request->input('enrollment_id'),
            'member_id' => $memberId,
            'proposed_values' => $proposedValues,
            'effective_from' => $request->input('effectiveFrom') ?? $request->input('effective_from'),
        ];

        return $this->guarded(function () use ($actor, $data) {
            $this->eligibility->assertEligible($actor);

            return $this->ok($this->service->submitAndAutoApply($actor, $data), 201);
        });
    }
}
