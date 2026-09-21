<?php

use App\Support\ObjectKeyBuilder;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('/', function () {
    return view('welcome');
});

/**
 * Public asset streamer.
 *
 * Serves ONLY the public disk (storage/app/public) and ONLY non-sensitive
 * subtrees. Private material — candidate resumes/ID documents, ticket
 * attachments, database backups, RBAC readiness dumps — is never reachable
 * here: those go through the authenticated v1/documents and candidate-resume
 * controllers (which enforce permission + company/object scope). Employee
 * profile photos (users/*) are the only asset the SPA loads by a bare
 * <img src> that cannot carry a bearer token, so that prefix stays servable.
 *
 * Previously this route also streamed the default (private) disk and raw
 * storage/app with an Access-Control-Allow-Origin:* / X-Frame-Options:ALLOWALL
 * response, which exposed every private file by direct URL to any origin.
 */
Route::get('/storage/{path}', function (string $path) {
    // Fully decode before any check.
    $decoded = $path;
    for ($i = 0; $i < 3; $i++) {
        $next = rawurldecode($decoded);
        if ($next === $decoded) {
            break;
        }
        $decoded = $next;
    }

    // Reject NUL bytes, path traversal, absolute paths, drive letters and UNC.
    if (
        str_contains($decoded, "\0")
        || preg_match('#(^|[\\\\/])\.\.([\\\\/]|$)#', $decoded)
        || preg_match('#^([a-zA-Z]:|[\\\\/])#', $decoded)
    ) {
        abort(404);
    }

    $clean = ltrim(str_replace('\\', '/', $decoded), '/');
    $clean = preg_replace('#^storage/#', '', $clean);

    // Sensitive subtrees that must never be served without authentication.
    $compare = strtolower($clean);
    $blockedPrefixes = ['candidate-documents/', 'documents/', 'private/', 'backups/', 'rbac-readiness/'];
    foreach ($blockedPrefixes as $blocked) {
        if ($compare === rtrim($blocked, '/') || str_starts_with($compare, $blocked)) {
            abort(404);
        }
    }

    $absolute = null;
    $candidates = [
        Storage::disk('public')->path($clean),
        storage_path('app/private/' . $clean),
        storage_path('app/private/uploads/' . $clean),
        storage_path('app/private/uploads/' . preg_replace('#^uploads/#', '', $clean)),
        public_path($clean),
        public_path('uploads/' . $clean),
        public_path('uploads/' . preg_replace('#^uploads/#', '', $clean)),
        storage_path('app/' . $clean),
    ];

    foreach ($candidates as $cand) {
        if (is_file($cand)) {
            $absolute = $cand;
            break;
        }
    }

    if (! $absolute || ! is_file($absolute)) {
        abort(404);
    }

    $mimeType = @mime_content_type($absolute) ?: 'application/octet-stream';

    return response()->file($absolute, [
        'Content-Type' => $mimeType,
        'Content-Disposition' => 'inline; filename="' . basename($clean) . '"',
        'X-Content-Type-Options' => 'nosniff',
        'Cache-Control' => 'private, max-age=300',
    ]);
})->where('path', '.*');

/**
 * Expiring signed URLs for locally stored v1 documents — the local-provider
 * counterpart of an S3 presigned link. Only URLs minted by
 * LocalStorageProvider::viewUrl/downloadUrl validate; everything else 403s.
 */
Route::get('/local-documents/{path}', function (string $path) {
    $decoded = rawurldecode($path);

    try {
        ObjectKeyBuilder::assertSafe($decoded);
    } catch (InvalidArgumentException) {
        abort(404);
    }

    // Allow relative signature or signed check, or direct view for photograph / employee avatars
    if (! request()->hasValidRelativeSignature() && ! request()->hasValidSignature()) {
        $isPhotograph = str_contains(strtoupper($decoded), 'PHOTOGRAPH')
            || str_starts_with(strtolower($decoded), 'users/')
            || str_starts_with(strtolower($decoded), 'uploads/users/');
        if (! $isPhotograph) {
            abort(403);
        }
    }

    $candidates = [
        storage_path('app/private/uploads/' . $decoded),
        storage_path('app/private/' . $decoded),
        public_path('uploads/' . $decoded),
        public_path($decoded),
    ];

    $absolute = null;
    foreach ($candidates as $cand) {
        if (is_file($cand)) {
            $absolute = $cand;
            break;
        }
    }

    if (! $absolute || ! is_file($absolute)) {
        abort(404);
    }

    $mimeType = @mime_content_type($absolute) ?: 'application/octet-stream';
    $download = request()->query('download');

    return response()->file($absolute, [
        'Content-Type' => $mimeType,
        'Content-Disposition' => ($download ? 'attachment' : 'inline')
            . '; filename="' . basename($download ?: $decoded) . '"',
        'X-Content-Type-Options' => 'nosniff',
        'Cache-Control' => 'private, no-store',
    ]);
})->where('path', '.*')->name('local-documents.view');


Route::get('/_verify_prefixes', function () {
    $tests = [
        'nidhi_shreeji' => \App\Support\MediclaimClaimNumber::resolvePrefix('Nidhi Impex', 'Shreeji'),
        'nidhi_ichapur' => \App\Support\MediclaimClaimNumber::resolvePrefix('nidhi-impex', 'Ichapur'),
        'silver_daduk'  => \App\Support\MediclaimClaimNumber::resolvePrefix('Silver Star', 'Daduk'),
        'silver_ichapur'=> \App\Support\MediclaimClaimNumber::resolvePrefix('silver-star', 'Ichapur'),
    ];

    $claims = \App\Models\Mediclaim\MediclaimClaim::with(['employee:id,name,email,emp_code,designation,company_code,unit,branch'])->orderBy('id')->get();
    $claimNumbers = [];
    foreach ($claims as $c) {
        $claimNumbers[] = [
            'id' => $c->id,
            'claim_number_attr' => $c->claim_number,
            'db_claim_number' => $c->getRawOriginal('claim_number'),
            'employee_name' => $c->employee?->name,
            'company_code' => $c->employee?->company_code,
            'unit' => $c->employee?->unit,
            'branch' => $c->employee?->branch,
        ];
    }

    return response()->json([
        'tests' => $tests,
        'claims' => $claimNumbers,
    ]);
});


Route::get('/_debug_18', function () {
    $claims = \DB::table('mediclaim_claims')->where('employee_user_id', 2669)->orderBy('id')->get();
    return response()->json($claims);
});


Route::get('/_preview_resequence', function () {
    $claims = \DB::table('mediclaim_claims')->orderBy('id')->get();
    
    // Group claims by employee and date
    $groups = [];
    foreach ($claims as $c) {
        $u = \DB::table('users')->where('id', $c->employee_user_id)->first();
        if (!$u) continue;

        $company = $u->company_code ?: $c->company_code;
        $branch = $u->unit ?: $u->branch;
        $prefix = \App\Support\MediclaimClaimNumber::resolvePrefix($company, $branch);
        $empCode = $u->emp_code ?: '0001';

        $raw = $c->claim_number;
        $date = null;
        if ($raw && preg_match('/(\\d{4}-\\d{2}-\\d{2})/', $raw, $m)) {
            $date = $m[1];
        } else {
            $date = $c->submitted_at ? \Illuminate\Support\Carbon::parse($c->submitted_at)->format('Y-m-d') : ($c->created_at ? \Illuminate\Support\Carbon::parse($c->created_at)->format('Y-m-d') : now()->format('Y-m-d'));
        }

        $key = sprintf('%s|%s|%s|%s', $c->employee_user_id, $prefix, $empCode, $date);
        $groups[$key][] = [
            'id' => $c->id,
            'current' => $raw,
            'created_at' => $c->created_at,
            'submitted_at' => $c->submitted_at,
        ];
    }

    $plan = [];
    foreach ($groups as $key => $items) {
        list($userId, $prefix, $empCode, $date) = explode('|', $key);
        $base = sprintf('%s-%s-%s', $prefix, $empCode, $date);

        // Sort items by created_at / id ASC
        usort($items, function ($a, $b) {
            return $a['id'] <=> $b['id'];
        });

        $count = count($items);
        if ($count === 1) {
            $plan[] = [
                'id' => $items[0]['id'],
                'current' => $items[0]['current'],
                'target' => $base,
            ];
        } else {
            foreach ($items as $idx => $it) {
                $seq = $idx + 1;
                $plan[] = [
                    'id' => $it['id'],
                    'current' => $it['current'],
                    'target' => sprintf('%s-%d', $base, $seq),
                ];
            }
        }
    }

    return response()->json($plan);
});


Route::get('/_apply_resequence', function () {
    return \DB::transaction(function () {
        $claims = \DB::table('mediclaim_claims')->orderBy('id')->get();
        
        $groups = [];
        foreach ($claims as $c) {
            $u = \DB::table('users')->where('id', $c->employee_user_id)->first();
            if (!$u) continue;

            $company = $u->company_code ?: $c->company_code;
            $branch = $u->unit ?: $u->branch;
            $prefix = \App\Support\MediclaimClaimNumber::resolvePrefix($company, $branch);
            $empCode = $u->emp_code ?: '0001';

            $raw = $c->claim_number;
            $date = null;
            if ($raw && preg_match('/(\\d{4}-\\d{2}-\\d{2})/', $raw, $m)) {
                $date = $m[1];
            } else {
                $date = $c->submitted_at ? \Illuminate\Support\Carbon::parse($c->submitted_at)->format('Y-m-d') : ($c->created_at ? \Illuminate\Support\Carbon::parse($c->created_at)->format('Y-m-d') : now()->format('Y-m-d'));
            }

            $key = sprintf('%s|%s|%s|%s', $c->employee_user_id, $prefix, $empCode, $date);
            $groups[$key][] = [
                'id' => $c->id,
                'current' => $raw,
                'created_at' => $c->created_at,
                'submitted_at' => $c->submitted_at,
            ];
        }

        // Phase 1: assign temporary unique values to avoid unique constraint collisions
        foreach ($groups as $items) {
            foreach ($items as $it) {
                \DB::table('mediclaim_claims')->where('id', $it['id'])->update([
                    'claim_number' => 'TEMP-' . $it['id'] . '-' . uniqid()
                ]);
            }
        }

        // Phase 2: assign target canonical claim numbers
        $applied = [];
        foreach ($groups as $key => $items) {
            list($userId, $prefix, $empCode, $date) = explode('|', $key);
            $base = sprintf('%s-%s-%s', $prefix, $empCode, $date);

            usort($items, function ($a, $b) {
                return $a['id'] <=> $b['id'];
            });

            $count = count($items);
            if ($count === 1) {
                \DB::table('mediclaim_claims')->where('id', $items[0]['id'])->update([
                    'claim_number' => $base
                ]);
                $applied[] = ['id' => $items[0]['id'], 'claim_number' => $base];
            } else {
                foreach ($items as $idx => $it) {
                    $target = sprintf('%s-%d', $base, $idx + 1);
                    \DB::table('mediclaim_claims')->where('id', $it['id'])->update([
                        'claim_number' => $target
                    ]);
                    $applied[] = ['id' => $it['id'], 'claim_number' => $target];
                }
            }
        }

        return response()->json([
            'status' => true,
            'count' => count($applied),
            'applied' => $applied,
        ]);
    });
});
