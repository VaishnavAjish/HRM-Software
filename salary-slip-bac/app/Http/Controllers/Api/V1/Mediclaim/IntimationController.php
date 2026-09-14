<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\ResolvesPrimaryCompanyCode;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimIntimation;
use App\Services\Mediclaim\PolicyEligibilityService;
use App\Support\MediclaimActivityLogSupport;
use App\Support\MediclaimIntimationNumber;
use App\Support\MediclaimNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * `GET,POST /me/intimations` — office-notify records for planned/emergency
 * treatment. Emergencies are exempt from any "must intimate before
 * treatment" rule (`PolicyEligibilityService::intimationRequired()`), but
 * this endpoint accepts either kind — the emergency flag only changes
 * whether the eligibility service later insists one exists at all.
 *
 * Accepts either the frontend's actual camelCase payload
 * (`memberId`/`hospitalId`/`treatingDoctor`/`plannedTreatment`/
 * `expectedAdmissionDate`/`estimatedAmount`/`employeeRemarks`/
 * `isEmergency`/`emergencyExplanation`) or snake_case.
 */
class IntimationController extends Controller
{
    use RespondsWithEnvelope;
    use ResolvesPrimaryCompanyCode;

    public function __construct(private readonly PolicyEligibilityService $eligibility)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $query = MediclaimIntimation::query()
            ->where('employee_user_id', $actor->id)
            ->with(['hospital', 'member', 'linkedClaim:id,claim_number,status']);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $isEmergency = (bool) ($request->input('isEmergency') ?? $request->input('is_emergency') ?? false);
        $emergencyExplanation = $request->input('emergencyExplanation') ?? $request->input('emergency_explanation');

        if ($isEmergency && ! trim((string) $emergencyExplanation)) {
            throw ValidationException::withMessages(['emergencyExplanation' => 'An explanation is required for an emergency notification.']);
        }

        $data = [
            'member_id' => $request->input('memberId') ?? $request->input('member_id'),
            'hospital_id' => $request->input('hospitalId') ?? $request->input('hospital_id'),
            'treating_doctor' => $request->input('treatingDoctor') ?? $request->input('treating_doctor'),
            'planned_treatment' => $request->input('plannedTreatment') ?? $request->input('planned_treatment'),
            'estimated_amount' => $request->input('estimatedAmount') ?? $request->input('estimated_amount'),
            'employee_remarks' => $request->input('employeeRemarks') ?? $request->input('employee_remarks'),
            'is_emergency' => $isEmergency,
            'emergency_explanation' => $isEmergency ? $emergencyExplanation : null,
            'expected_admission_date' => $request->input('expectedAdmissionDate') ?? $request->input('expected_admission_date'),
        ];

        if (! $isEmergency && ! $data['expected_admission_date']) {
            throw ValidationException::withMessages(['expectedAdmissionDate' => 'Expected admission/treatment date is required for planned treatment.']);
        }
        if (! $data['planned_treatment']) {
            throw ValidationException::withMessages(['plannedTreatment' => 'Describe the planned treatment.']);
        }

        $actor = auth('api')->user();
        $companyCode = $this->primaryCompanyCode($actor);

        return $this->guarded(function () use ($data, $actor, $companyCode) {
            $this->eligibility->assertEligible($actor);

            $intimation = DB::transaction(function () use ($data, $actor, $companyCode) {
                $intimation = MediclaimIntimation::create($data + [
                    'employee_user_id' => $actor->id,
                    'company_code' => $companyCode,
                    'reference_number' => MediclaimIntimationNumber::next($companyCode),
                    'status' => MediclaimIntimation::STATUSES[0],
                    'notified_at' => now(),
                    'notified_by' => $actor->id,
                ]);

                MediclaimActivityLogSupport::log(
                    $actor,
                    'INTIMATION_RECORDED',
                    'mediclaim_intimation',
                    $intimation->id,
                    null,
                    $intimation->toArray(),
                    'Office intimation recorded.',
                    $companyCode
                );

                // No event-anchored or dedupe-table idempotency needed here (see
                // MediclaimNotifier's class docblock): this runs exactly once per
                // POST /me/intimations request, with no cron/replay path that
                // could double-fire it.
                DB::afterCommit(function () use ($intimation, $actor) {
                    MediclaimNotifier::officeIntimationRecorded($intimation, $actor);
                });

                return $intimation;
            });

            return $this->ok($intimation->fresh(['hospital', 'member']), 201);
        });
    }
}
