<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The category list from the spec, with its routing table applied.
 *
 * Seeded rather than hard-coded so a Super Admin can edit, deactivate or add to
 * them later without a deploy. Idempotent: re-running skips slugs that exist, so
 * a category an administrator has since renamed is not reverted.
 */
return new class extends Migration
{
    private const CATEGORIES = [
        ['Attendance',         'attendance',         'HR',      'Attendance marking, regularisation and shift queries'],
        ['Salary',             'salary',             'Payroll', 'Salary credit, deductions and payslip queries'],
        ['Leave',              'leave',              'HR',      'Leave balance, application and approval queries'],
        ['HR',                 'hr',                 'HR',      'General HR policy and workplace queries'],
        ['IT Support',         'it-support',         'IT',      'Accounts, access and general IT assistance'],
        ['Payroll',            'payroll',            'Payroll', 'Payroll processing and statutory deduction queries'],
        ['Form 16',            'form-16',            'Payroll', 'Form 16 generation and correction requests'],
        ['Appointment',        'appointment',        'HR',      'Appointment form and joining formalities'],
        ['Employee Documents', 'employee-documents', 'HR',      'Document submission, correction and reissue'],
        ['Software Issue',     'software-issue',     'IT',      'Application errors and software requests'],
        ['Hardware Issue',     'hardware-issue',     'IT',      'Laptop, desktop and peripheral faults'],
        ['Network Issue',      'network-issue',      'IT',      'Connectivity, VPN and network access'],
        ['Other',              'other',              null,      'Anything that does not fit the categories above'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('ticket_categories')) {
            return;
        }

        $now = now();
        $sort = 0;

        foreach (self::CATEGORIES as [$name, $slug, $department, $description]) {
            $sort += 10;

            if (DB::table('ticket_categories')->where('slug', $slug)->exists()) {
                continue;
            }

            DB::table('ticket_categories')->insert([
                'name' => $name,
                'slug' => $slug,
                'description' => $description,
                'default_department' => $department,
                'is_active' => true,
                'sort_order' => $sort,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('ticket_categories')) {
            return;
        }

        // Only the seeded slugs, and only those with no tickets behind them —
        // a rollback must not take an administrator's own categories or orphan
        // real tickets.
        $slugs = array_column(self::CATEGORIES, 1);

        DB::table('ticket_categories')
            ->whereIn('slug', $slugs)
            ->when(Schema::hasTable('tickets'), function ($query) {
                $query->whereNotIn('id', function ($sub) {
                    $sub->select('category_id')->from('tickets')->whereNotNull('category_id');
                });
            })
            ->delete();
    }
};
