<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\AttendanceRegularization;
use App\Models\User;
use App\Services\Attendance\AttendanceRegularizationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/** `GET,POST /v1/attendance/regularizations`, `POST /v1/attendance/regularizations/{id}/decision` — spec §19. */
class AttendanceRegularizationController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(private readonly AttendanceRegularizationService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = AttendanceRegularization::query()->with(['user:id,name,emp_code', 'requestedBy:id,name', 'approvedBy:id,name']);

        if ($request->filled('status')) {
            $query->where('approval_status', $request->query('status'));
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->query('user_id'));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'date' => ['required', 'date'],
            'field' => ['required', Rule::in(['check_in', 'check_out', 'status', 'both'])],
            'new_check_in' => ['sometimes', 'nullable', 'date'],
            'new_check_out' => ['sometimes', 'nullable', 'date'],
            'new_status' => ['sometimes', 'nullable', 'string', 'max:40'],
            'reason' => ['required', 'string', 'min:5', 'max:2000'],
        ]);

        $employee = User::findOrFail($data['user_id']);
        $actor = auth('api')->user();

        $reg = $this->service->request(
            $employee,
            Carbon::parse($data['date']),
            $actor,
            $data['field'],
            isset($data['new_check_in']) ? Carbon::parse($data['new_check_in']) : null,
            isset($data['new_check_out']) ? Carbon::parse($data['new_check_out']) : null,
            $data['new_status'] ?? null,
            $data['reason']
        );

        return $this->ok($reg, 201);
    }

    public function decide(Request $request, int $regularization): JsonResponse
    {
        $model = AttendanceRegularization::find($regularization);
        if (! $model) {
            return $this->missing('Regularization request not found.');
        }

        $data = $request->validate([
            'decision' => ['required', Rule::in(['approve', 'reject'])],
            'remarks' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $updated = $this->service->decide($model, auth('api')->user(), $data['decision'] === 'approve', $data['remarks'] ?? null);

        return $this->ok($updated);
    }
}
