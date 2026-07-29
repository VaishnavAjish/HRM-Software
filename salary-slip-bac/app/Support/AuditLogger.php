<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogger
{
    public static function log(Request $request, string $action, string $module, ?array $old = null, ?array $new = null): void
    {
        $ip = $request->header('X-Forwarded-For')
            ? trim(explode(',', $request->header('X-Forwarded-For'))[0])
            : ($request->header('X-Real-IP') ?? $request->ip());

        AuditLog::create([
            'user_id' => optional(auth('api')->user())->id,
            'action' => $action,
            'module' => $module,
            'old_value' => $old,
            'new_value' => $new,
            'ip_address' => $ip,
            'user_agent' => $request->userAgent(),
        ]);
    }
}
