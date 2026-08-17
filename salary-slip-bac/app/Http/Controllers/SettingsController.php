<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Models\Company;
use App\Models\CompanyConfiguration;
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
        'hr.doc_types' => '[{"id":"aadhaar","name":"Aadhaar Card","mandatory":true,"expiryTracked":false,"allowed":"PDF, JPG, PNG","maxSize":"5 MB"},{"id":"pan","name":"PAN Card","mandatory":true,"expiryTracked":false,"allowed":"PDF, JPG, PNG","maxSize":"5 MB"},{"id":"passport","name":"Passport","mandatory":false,"expiryTracked":true,"allowed":"PDF","maxSize":"10 MB"},{"id":"driving","name":"Driving License","mandatory":false,"expiryTracked":true,"allowed":"PDF, JPG","maxSize":"5 MB"},{"id":"education","name":"Degree Certificates","mandatory":true,"expiryTracked":false,"allowed":"PDF","maxSize":"10 MB"},{"id":"experience","name":"Relieving & Experience Letters","mandatory":true,"expiryTracked":false,"allowed":"PDF","maxSize":"10 MB"}]',
        'hr.mail_templates' => '[{"id":"offer","name":"Offer Letter","category":"Hiring","updated":"Aug 17, 2026","vars":"{candidate_name}, {designation}, {ctc}, {joining_date}, {expiry_date}","body":"Dear {candidate_name},\n\nWe\'re delighted to offer you the position of {designation}. Welcome to the team — here\'s a summary of your offer:\n\nPlease reply to this email to accept or discuss the offer — our HR team will follow up with the full offer letter and onboarding steps."},{"id":"interview","name":"Interview Scheduled","category":"Hiring","updated":"Aug 17, 2026","vars":"{candidate_name}, {interview_title}, {interview_date}, {interview_time}, {interview_link}, {interview_notes}","body":"Hello {candidate_name},\n\nYour interview for {interview_title} has been scheduled.\n\nPlease find the details below. Ensure you are ready at least 5 minutes before the scheduled time."},{"id":"assessment","name":"Assessment Invite","category":"Hiring","updated":"Aug 17, 2026","vars":"{candidate_name}, {quiz_title}, {duration}, {deadline}","body":"Hello {candidate_name},\n\nWe are pleased to invite you to take an assessment for your application. This assessment helps us understand your skills better.\n\nPlease complete it before the deadline."},{"id":"message","name":"Candidate Message","category":"Hiring","updated":"Aug 17, 2026","vars":"{candidate_name}, {message}","body":"Hello {candidate_name},\n\n{message}"}]',

        // Domain 00.2 Global Application Configuration defaults
        'app.title' => 'NISS HRMS',
        'app.url' => '',
        'app.locale' => 'en',
        'app.timezone' => 'UTC',
        'app.currency' => 'USD',
        'app.date_format' => 'm/d/Y',
        'app.time_format' => 'h:i A',
        'app.number_format' => '1,2,3.45',
        'app.week_start_day' => '1',
        'app.financial_year_start_month' => '1',
        'maintenance_mode' => 'false',
        'maintenance_message' => '',
    ];

    public function index(Request $request)
    {
        $group = $request->query('group', 'rbac');

        $existing = Setting::where('group', $group)->pluck('value', 'key');

        $data = collect(self::DEFAULTS)
            ->filter(fn($v, $key) => str_starts_with($key, $group . '.') || str_starts_with($key, 'app.'))
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

        // Also update company-level configuration if group is 'app'
        if ($group === 'app') {
            $company = auth('api')->user()?->company;
            if ($company) {
                $config = $company->configuration;
                if (!$config) {
                    $config = $company->configuration()->create([]);
                }

                foreach ($request->settings as $item) {
                    $config->updateOrCreate(
                        ['key' => $item['key']],
                        ['value' => $item['value'] ?? '', 'key' => $item['key']]
                    );
                }
            }
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
