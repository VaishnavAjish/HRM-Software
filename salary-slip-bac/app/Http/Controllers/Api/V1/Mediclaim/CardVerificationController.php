<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Controller;
use App\Services\Mediclaim\MediclaimCardService;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /api/v1/mediclaim/cards/verify/{token}` — public, unauthenticated
 * (deliberately OUTSIDE `jwt.auth`/`module.schema:mediclaim`, its own
 * `throttle:20,1` — see routes/mediclaim.php).
 *
 * B6's identical-404 requirement: "never existed" and "revoked/inactive"
 * must be indistinguishable to an unauthenticated caller —
 * `MediclaimCardService::verifyByToken()` already collapses both to `null`,
 * so this controller only ever renders one generic not-found shape.
 */
class CardVerificationController extends Controller
{
    public function __construct(private readonly MediclaimCardService $cards)
    {
    }

    public function show(Request $request, string $token): JsonResponse
    {
        $result = $this->cards->verifyByToken($token);

        MediclaimActivityLogSupport::log(
            null,
            'CARD_VERIFY_ATTEMPT',
            'mediclaim_card',
            null,
            null,
            ['hit' => $result !== null, 'token_hash_prefix' => substr(hash('sha256', $token), 0, 12)],
            $result !== null ? 'Card verify hit.' : 'Card verify miss.',
        );

        $response = $result === null
            ? response()->json(['success' => false, 'error' => ['code' => 'NOT_FOUND', 'message' => 'This card could not be verified.']], 404)
            : response()->json(['success' => true, 'data' => $result]);

        return $response->header('Cache-Control', 'no-store');
    }
}
