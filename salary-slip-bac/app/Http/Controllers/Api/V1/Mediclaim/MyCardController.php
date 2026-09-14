<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET /me/cards` — the authenticated employee's own (and their covered
 * members') Mediclaim cards. `qr_token_hash` is stripped from every row —
 * the plaintext token is only ever available once, at generation
 * (`MediclaimCardService::generate()`), and the hash itself has no
 * legitimate client-facing use.
 */
class MyCardController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $memberIds = MediclaimMember::query()->where('employee_user_id', $actor->id)->pluck('id');

        $cards = MediclaimCard::query()
            ->whereIn('member_id', $memberIds)
            ->with('member')
            ->orderByDesc('id')
            ->get()
            ->makeHidden('qr_token_hash');

        return $this->ok($cards);
    }
}
