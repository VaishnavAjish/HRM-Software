<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogger
{
    public static function log(Request $request, string $action, string $module, ?array $old = null, ?array $new = null): void
    {
        AuditLog::create([
            'user_id' => optional(auth('api')->user())->id,
            'action' => $action,
            'module' => $module,
            'old_value' => $old,
            'new_value' => $new,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }
}
