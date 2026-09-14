<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Concerns;

use App\Services\Provisioning\ProvisioningException;
use Illuminate\Http\JsonResponse;

/**
 * Shared JSON envelope + exception rendering for every Mediclaim API
 * controller (self-service and admin alike), matching
 * `Api\V1\Admin\Organization\*`'s convention exactly (the namespace this
 * module's controller split deliberately mirrors — see
 * `OrganizationUnitController::guarded()`/`missing()`):
 *
 *   success -> {"success": true, "data": ...}
 *   failure -> {"success": false, "error": {"code": "...", "message": "..."}}
 *
 * `ValidationException` (422 — both plain `$request->validate()` failures and
 * every "illegal transition"/"remarks too short" error `ClaimWorkflowService`
 * and its sibling services throw via `ValidationException::withMessages()`)
 * is deliberately NOT caught here. Laravel's default JSON exception renderer
 * already turns it into a 422 response shaped `{"message":..., "errors":
 * {field: [...]}}`, and every other controller in this codebase that calls
 * `$request->validate()` or throws `ValidationException::withMessages()`
 * directly (see `JobRequisitionController`, `OrganizationUnitController`)
 * leaves that to propagate unmodified rather than re-wrapping it. Only the
 * Mediclaim-specific `ProvisioningException` subtree — `MediclaimException`'s
 * 403 (`WRONG_CLAIM_OWNER`, `WRONG_ASSIGNED_REVIEWER`) and 409
 * (`CONFIDENTIALITY_ACK_REQUIRED`) domain errors — is rendered in the
 * `{success:false, error}` shape here, exactly mirroring
 * `OrganizationUnitController::guarded()`'s catch of `ProvisioningException`.
 */
trait RespondsWithEnvelope
{
    protected function ok($data, int $status = 200): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data], $status);
    }

    /** Runs $run(), rendering any thrown ProvisioningException (incl. MediclaimException) in the standard error envelope. */
    protected function guarded(callable $run): JsonResponse
    {
        try {
            return $run();
        } catch (ProvisioningException $e) {
            return response()->json([
                'success' => false,
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->status);
        }
    }

    /**
     * 404-concealment response. Used both for "this id genuinely does not
     * exist" and "this id exists but is outside the actor's
     * `MediclaimClaim::visibleTo()`/`decidableBy()` scope" — the two must be
     * indistinguishable to the caller, which is the entire point of scoping
     * the query before `find()`/`first()` rather than loading the row and
     * then checking `if (!authorized) abort(403)`.
     */
    protected function missing(string $message = 'Not found.'): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => 'NOT_FOUND', 'message' => $message],
        ], 404);
    }
}
