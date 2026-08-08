<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Support\AuditLogger;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    private const DEFAULTS = [
        'rbac.require_2fa' => 'false',
        'rbac.session_timeout_minutes' => '60',
        'rbac.enable_audit_logging' => 'true',
        'rbac.max_failed_login_attempts' => '5',

        // Which widgets show on the RBAC dashboard — surfaced there via a
        // settings panel instead of a separate Settings page.
        'dashboard.show_total_users' => 'true',
        'dashboard.show_active_users' => 'true',
        'dashboard.show_total_roles' => 'true',
        'dashboard.show_total_permissions' => 'true',
        'dashboard.show_departments' => 'true',
        'dashboard.show_locations' => 'true',
        'dashboard.show_approval_levels' => 'true',
        'dashboard.show_users_by_role_chart' => 'true',
        'dashboard.show_users_by_department_chart' => 'true',
        'dashboard.show_recent_activity' => 'true',

        // Pasted once by HR, then appended into every generated JD's "How to
        // Apply" section — see RequisitionsTab's buildJdTemplate. One shared
        // form for all requisitions, per the candidate-intake design.
        'hr.google_form_url' => '',
        'hr.indeed_client_id' => '',
        'hr.indeed_client_secret' => '',
        'hr.indeed_employer_id' => '',
    ];

    public function index(Request $request)
    {
        $group = $request->query('group', 'rbac');

        $existing = Setting::where('group', $group)->pluck('value', 'key');

        $data = collect(self::DEFAULTS)
            ->filter(fn($v, $key) => str_starts_with($key, $group . '.'))
            ->map(fn($default, $key) => $existing->get($key, $default))
            ->map(fn($value, $key) => ['key' => $key, 'value' => $value, 'group' => $group])
            ->values();

        return response()->json(['status' => true, 'data' => $data]);
    }

    public function update(Request $request)
    {
        $request->validate([
            'settings' => 'required|array',
            'settings.*.key' => 'required|string',
            'settings.*.value' => 'nullable|string',
        ]);

        $group = $request->query('group', 'rbac');
        $before = Setting::where('group', $group)->pluck('value', 'key');

        foreach ($request->settings as $item) {
            Setting::updateOrCreate(
                ['key' => $item['key']],
                ['value' => $item['value'] ?? '', 'group' => $group]
            );
        }

        AuditLogger::log(
            $request,
            'UPDATE',
            'Settings',
            ['group' => $group, 'values' => $before],
            ['group' => $group, 'values' => collect($request->settings)->pluck('value', 'key')]
        );

        return response()->json(['status' => true, 'message' => 'Settings updated']);
    }
}
