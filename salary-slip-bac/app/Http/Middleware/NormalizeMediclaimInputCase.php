<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The Mediclaim frontend module sends request bodies in camelCase (its own
 * established convention throughout `src/features/mediclaim/`), while every
 * Mediclaim controller validates/consumes snake_case (matching this
 * backend's Eloquent column-name convention). Rather than hand-mapping every
 * field in every controller — already done piecemeal for a couple of
 * endpoints and easy to miss one, which is exactly what happened for claim
 * submission and office intimations — this middleware recursively rewrites
 * every camelCase key in the JSON request body to snake_case before it
 * reaches the controller, so every current and future Mediclaim endpoint
 * gets consistent keys regardless of which casing the caller actually sent.
 *
 * Scoped to the `v1/mediclaim` route group only (see `routes/mediclaim.php`)
 * — this is a Mediclaim-specific convention mismatch, not a repo-wide one,
 * and every other route group's existing behavior stays untouched.
 *
 * A request body key that's already snake_case round-trips unchanged
 * (`Str::snake('member_id') === 'member_id'`), so a caller sending either
 * casing — or a mix — works correctly.
 */
class NormalizeMediclaimInputCase
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->isJson() || $request->isMethod('post') || $request->isMethod('put') || $request->isMethod('patch')) {
            $normalized = $this->normalize($request->all());
            $request->replace($normalized);

            if ($request->isJson()) {
                $request->getContent();
                $request->json()->replace($normalized);
            }
        }

        return $next($request);
    }

    private function normalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        $isList = array_is_list($value);
        $result = [];

        foreach ($value as $key => $item) {
            $normalizedItem = $this->normalize($item);
            $result[$isList ? $key : Str::snake((string) $key)] = $normalizedItem;
        }

        return $result;
    }
}
