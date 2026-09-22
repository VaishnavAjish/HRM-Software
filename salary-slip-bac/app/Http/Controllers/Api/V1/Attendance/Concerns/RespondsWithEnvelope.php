<?php

namespace App\Http\Controllers\Api\V1\Attendance\Concerns;

use Illuminate\Http\JsonResponse;

/**
 * Same envelope shape as the rest of this codebase's newer API modules
 * (see Mediclaim's identically-named trait) — duplicated rather than
 * cross-imported, to keep the Attendance module's own namespace
 * self-contained.
 */
trait RespondsWithEnvelope
{
    protected function ok($data, int $status = 200): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data], $status);
    }

    protected function missing(string $message = 'Not found.'): JsonResponse
    {
        return response()->json(['success' => false, 'error' => ['code' => 'NOT_FOUND', 'message' => $message]], 404);
    }
}
