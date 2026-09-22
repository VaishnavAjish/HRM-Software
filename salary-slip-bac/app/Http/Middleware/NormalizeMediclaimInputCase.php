<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
class NormalizeMediclaimInputCase
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->query->count() > 0) {
            $request->query->replace($this->normalize($request->query->all()));
        }

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

        $aliases = [
            'is_medico_legal' => 'is_medico_legal_case',
            'is_ongoing' => 'is_ongoing_treatment',
            'symptoms_first_noticed_on' => 'first_symptom_date',
            'treating_doctor_or_hospital' => 'treating_doctor_name',
        ];

        foreach ($value as $key => $item) {
            $normalizedItem = $this->normalize($item);
            if ($isList) {
                $result[$key] = $normalizedItem;
            } else {
                $snakeKey = Str::snake((string) $key);
                $finalKey = $aliases[$snakeKey] ?? $snakeKey;
                $result[$finalKey] = $normalizedItem;
                if (isset($aliases[$snakeKey])) {
                    $result[$snakeKey] = $normalizedItem;
                }
            }
        }

        return $result;
    }
}
