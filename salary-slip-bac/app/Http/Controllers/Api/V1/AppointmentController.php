<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\DocumentException;
use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\User;
use App\Services\Documents\DocumentAudit;
use App\Services\Documents\DocumentAuthorizer as Auth;
use App\Support\AadhaarDisclosure;
use App\Support\AadhaarReference;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Appointment Details create/update/complete.
 *
 * Split out from the old all-in-one submit so the record exists — and has a real
 * id — before any document is uploaded against it. Documents are then uploaded
 * one at a time through DocumentController::storeForAppointment.
 */
class AppointmentController extends Controller
{
    /** Fields the appointment form owns. Deliberately excludes files. */
    private const FIELDS = [
        'emp_code', 'joining_date', 'department', 'designation', 'manager_name', 'salary',
        'mobile_number', 'emp_whatsapp_no', 'punching_no', 'name', 'email', 'address',
        'village', 'taluka', 'district', 'dob', 'birth_place', 'gender', 'cast',
        'marital_status', 'blood_group', 'reference_name', 'reference_mobile_no',
        'aadhar_card_no', 'bank_name', 'pan_card_no', 'bank_ifsc_code', 'education',
        'bank_account_no', 'company_code', 'unit', 'emp_signature', 'members',
        'city', 'state', 'pin', 'mobile_no_2',
    ];

    /** Documents that must exist before an appointment can be completed. */
    private const REQUIRED_DOCUMENTS = ['AADHAR_CARD', 'PAN_CARD'];

    /** How long the client may keep a revealed number on screen. */
    private const REVEAL_TTL_SECONDS = 30;

    private function requestId(): string
    {
        return request()->header('X-Request-Id') ?: (string) Str::uuid();
    }

    private function ok($data, int $status = 200)
    {
        return response()->json(['success' => true, 'data' => $data, 'meta' => ['requestId' => $this->requestId()]], $status);
    }

    private function fail(DocumentException $e)
    {
        return response()->json($e->toArray($this->requestId()), $e->status);
    }

    private function rules(bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name'            => "{$required}|string|max:255",
            'email'           => "{$required}|email|max:255",
            'mobile_number'   => "{$required}|regex:/^[6-9]\d{9}$/",
            'aadhar_card_no'  => "{$required}|regex:/^\d{4}[\s-]?\d{4}[\s-]?\d{4}$/",
            'pan_card_no'     => 'nullable|regex:/^[A-Za-z]{5}\d{4}[A-Za-z]$/',
            'bank_ifsc_code'  => 'nullable|regex:/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/',
            'bank_account_no' => 'nullable|regex:/^\d{9,18}$/',
            'company_code'    => "{$required}|string|max:100",
            'unit'            => 'nullable|string|max:100',
            'members'         => 'nullable',
        ];
    }

    /** Only the appointment's own fields; never a file. */
    private function payload(Request $request): array
    {
        $data = array_intersect_key($request->except(['_token']), array_flip(self::FIELDS));

        if (isset($data['members']) && is_array($data['members'])) {
            $data['members'] = json_encode($data['members']);
        }

        if (!empty($data['aadhar_card_no'])) {
            $data['aadhar_card_no'] = AadhaarReference::normalise($data['aadhar_card_no']);
        }

        return $data;
    }

    public function store(Request $request)
    {
        $request->validate($this->rules(true));

        try {
            $actor = auth('api')->user();

            if (!$actor) {
                throw new DocumentException(DocumentException::AUTHENTICATION_REQUIRED, 'Authentication required.', 401);
            }

            $data = $this->payload($request);

            // A non-super-admin cannot file an appointment into a company they
            // do not manage.
            if (!Auth::isSuperAdmin($actor) && ($data['company_code'] ?? null) !== $actor->company_code) {
                $data['company_code'] = $actor->company_code;
            }

            $appointment = DB::transaction(function () use ($data, $actor) {
                return User::create($data + [
                    'type'     => 'appointment',
                    'role'     => 3,
                    'status'   => 0,
                    'password' => Str::random(32), // placeholder until onboarding
                    'added_by' => $actor->id,
                ]);
            });

            DocumentAudit::record('APPOINTMENT_CREATED', null, null, [
                'appointment_id' => $appointment->id,
                'company_code'   => $appointment->company_code,
            ]);

            return $this->ok([
                'appointmentId'     => $appointment->id,
                'appointmentNumber' => 'APT-' . str_pad((string) $appointment->id, 6, '0', STR_PAD_LEFT),
                'aadhaarMasked'     => $appointment->aadhaar_masked,
                'message'           => 'Appointment details saved successfully.',
            ], 201);
        } catch (DocumentException $e) {
            return $this->fail($e);
        } catch (Throwable $e) {
            report($e);

            return $this->fail(new DocumentException(
                'APPOINTMENT_SAVE_FAILED', 'Unable to save appointment details. Please try again.', 500
            ));
        }
    }

    public function update(Request $request, int $appointmentId)
    {
        $request->validate($this->rules(false));

        try {
            [$appointment, $actor] = $this->findAuthorized($appointmentId);

            $data = $this->payload($request);

            if (!Auth::isSuperAdmin($actor)) {
                // Moving a record between companies is not a form edit.
                unset($data['company_code']);
            }

            DB::transaction(fn () => $appointment->update($data));

            DocumentAudit::record('APPOINTMENT_UPDATED', null, null, [
                'appointment_id' => $appointment->id,
                'fields'         => array_keys($data),
            ]);

            return $this->ok([
                'appointmentId'     => $appointment->id,
                'appointmentNumber' => 'APT-' . str_pad((string) $appointment->id, 6, '0', STR_PAD_LEFT),
                'aadhaarMasked'     => $appointment->fresh()->aadhaar_masked,
                'message'           => 'Appointment details updated successfully.',
            ]);
        } catch (DocumentException $e) {
            return $this->fail($e);
        } catch (Throwable $e) {
            report($e);

            return $this->fail(new DocumentException(
                'APPOINTMENT_UPDATE_FAILED', 'Unable to update appointment details. Please try again.', 500
            ));
        }
    }

    /** Powers refresh recovery: the form reloads itself from here. */
    public function show(Request $request, int $appointmentId)
    {
        try {
            [$appointment, $actor] = $this->findAuthorized($appointmentId);

            // toArray() hides the raw Aadhaar and appends aadhaar_masked.
            $payload = $appointment->toArray();

            // aadhaar_full is added only here and only for an actor who is allowed
            // to reach this record. The column stays in User::$hidden so nothing
            // else in the app can serialise it by accident.
            $payload = AadhaarDisclosure::attach(
                $payload,
                $appointment,
                $actor,
                'APPOINTMENT_FULL_AADHAAR_VIEWED'
            );

            return $this->ok([
                'appointmentId'     => $appointment->id,
                'appointmentNumber' => 'APT-' . str_pad((string) $appointment->id, 6, '0', STR_PAD_LEFT),
                'appointment'       => $payload,
            ]);
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    /**
     * GET /v1/appointments/{id}/documents
     *
     * Scoped to this appointment specifically, not to the employee: one person
     * can have several appointments, and historical records share Aadhaar
     * numbers, so employee-level listing would mix unrelated documents together.
     */
    public function documents(Request $request, int $appointmentId)
    {
        try {
            [$appointment, $actor] = $this->findAuthorized($appointmentId);

            $documents = Document::query()
                ->where('user_id', $appointment->id)
                ->visible() // soft-deleted rows are excluded by default
                ->with('currentVersionRecord')
                ->orderByDesc('created_at')
                ->get()
                ->map(function (Document $document) use ($actor) {
                    $current = $document->currentVersionRecord;

                    return [
                        'documentId'    => $document->id,
                        'documentType'  => $document->document_type,
                        'documentLabel' => $document->document_label,
                        'status'        => $document->status,
                        'version'       => $document->current_version,
                        'createdAt'     => optional($document->created_at)->toIso8601String(),
                        'currentVersion' => $current ? [
                            'versionId'        => $current->id,
                            'version'          => $current->version,
                            'fileName'         => $current->generated_file_name,
                            'originalFileName' => $current->original_file_name,
                            'mimeType'         => $current->mime_type,
                            'fileSize'         => $current->file_size,
                            'uploadedAt'       => optional($current->uploaded_at)->toIso8601String(),
                            'uploadedBy'       => $current->uploaded_by,
                        ] : null,
                        'actions' => Auth::actionsFor($actor, $document),
                    ];
                })
                ->all();

            return $this->ok(['items' => $documents, 'total' => count($documents)]);
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    public function complete(Request $request, int $appointmentId)
    {
        try {
            [$appointment, $actor] = $this->findAuthorized($appointmentId);

            $present = Document::where('user_id', $appointment->id)
                ->visible()
                ->pluck('document_type')
                ->all();

            $missing = array_values(array_diff(self::REQUIRED_DOCUMENTS, $present));

            if ($missing) {
                return response()->json([
                    'success' => false,
                    'error'   => [
                        'code'    => 'APPOINTMENT_DOCUMENTS_MISSING',
                        'message' => 'Upload the required documents before completing this appointment.',
                        'details' => ['missing' => $missing],
                    ],
                    'meta' => ['requestId' => $this->requestId()],
                ], 422);
            }

            $appointment->forceFill([
                'processed' => 1,
                'status'    => 0,
            ])->save();

            DocumentAudit::record('APPOINTMENT_COMPLETED', null, null, [
                'appointment_id' => $appointment->id,
                'completed_by'   => $actor?->id,
            ]);

            return $this->ok([
                'appointmentId' => $appointment->id,
                'status'        => 'COMPLETED',
                'message'       => 'Appointment completed successfully.',
            ]);
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    /**
     * POST /v1/appointments/{id}/aadhaar/reveal
     *
     * Predates full-number display and is kept for API compatibility: the details
     * response now carries `aadhaar_full` for any authorised caller, so a separate
     * reveal call is no longer how the UI obtains the number. Still authorised on
     * record scope and still audited per attempt.
     *
     * POST rather than GET so it is not casually cached, retried by a prefetch,
     * or captured in a browser history entry, and the response carries no-store
     * headers on top of that.
     */
    public function revealAadhaar(Request $request, int $appointmentId)
    {
        try {
            // Scope first: an actor who cannot reach the appointment at all must
            // not learn whether it has an Aadhaar on file.
            [$appointment, $actor] = $this->findAuthorized($appointmentId);

            // Print and PDF come back through here so the server re-authorises
            // each action rather than trusting a flag the client sends. A
            // client-side `includeFullAadhaar: true` proves nothing.
            $context = strtoupper((string) $request->input('context', 'VIEW'));
            $action = match ($context) {
                'PRINT' => 'APPOINTMENT_FULL_AADHAAR_PRINTED',
                'PDF' => 'APPOINTMENT_FULL_AADHAAR_PDF_DOWNLOADED',
                default => 'APPOINTMENT_AADHAAR_REVEALED',
            };

            // No second authorisation check here. Disclosure is gated on record
            // access, which findAuthorized above has already established and
            // already audited as PERMISSION_DENIED when it fails — a duplicate
            // check would be unreachable code pretending to be a control.
            $digits = AadhaarReference::normalise(
                (string) ($appointment->getRawOriginal('aadhar_card_no') ?? '')
            );

            if (!AadhaarReference::isValid($digits)) {
                // Same response whether it is absent or malformed — the caller
                // does not need to be told which.
                throw new DocumentException(
                    DocumentException::APPOINTMENT_AADHAAR_MISSING,
                    'A valid Aadhaar number is not available for this appointment.',
                    404
                );
            }

            DocumentAudit::record(
                $action,
                null,
                null,
                [
                    'appointment_id' => $appointment->id,
                    'organization_code' => $appointment->company_code,
                    'context' => $context,
                    // Last four only. The audit trail records that access
                    // happened, never a second copy of the number.
                    'aadhaar_last4' => substr($digits, -4),
                ],
                'RECORD_ACCESS',
                'ALLOWED'
            );

            return $this->ok([
                'aadhaarNumber' => $digits,
                'expiresIn' => self::REVEAL_TTL_SECONDS,
            ])
                ->header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
                ->header('Pragma', 'no-cache')
                ->header('Expires', '0');
        } catch (DocumentException $e) {
            return $this->fail($e);
        }
    }

    /** @return array{0:User,1:?User} */
    private function findAuthorized(int $appointmentId): array
    {
        $appointment = User::find($appointmentId);

        if (!$appointment) {
            throw new DocumentException(
                DocumentException::APPOINTMENT_NOT_FOUND, 'Appointment details were not found.', 404
            );
        }

        $actor = auth('api')->user();

        if (!Auth::canAccessOwner($actor, $appointment)) {
            DocumentAudit::denied(Auth::READ);

            throw new DocumentException(
                DocumentException::APPOINTMENT_ACCESS_DENIED, 'You do not have access to this appointment.', 403
            );
        }

        return [$appointment, $actor];
    }
}
