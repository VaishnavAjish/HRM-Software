<?php

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Turn the portal capabilities on, and give the employee and agent shells the
 * page grants their menus used to render without asking anybody.
 *
 * Two things arrive together here because neither is safe alone.
 *
 * The capabilities existed but nothing held them, so portalFor() fell through to
 * the legacy tier rule for every account and the control was inert. And the
 * employee and agent pages had just gained routes, which means canRoute() now
 * refuses any of them a role does not hold — a shell whose pages are all denied
 * is a blank portal.
 *
 * Portal assignment is by role code, not by tier:
 *
 *   employee, emp   ui.portals.employee
 *   agent           ui.portals.agent
 *   everything else ui.portals.business
 *
 * The default is business rather than employee on purpose. tierForCode() maps
 * every unrecognised code to the employee tier, which is exactly the confusion
 * being removed — HR Manager, Account and every custom role are business roles
 * that happen to carry tier 3. Super administrators are unaffected either way:
 * the engine answers before it reads a grant.
 *
 * ui.portals is granted alongside, because it is the parent and a child whose
 * ancestor is unheld resolves to DENY. `admin` is the case that matters — it
 * holds ui.dashboard and no ui.portals row at all.
 *
 * Shell pages are granted only where the role can already call the API behind
 * them. That rule is what keeps this from widening access: `emp` holds
 * self.payslip.read, so it keeps Payslips; it holds neither self.ticket.read nor
 * payroll.form16.read nor hr.appointment.read, so My Tickets, My Form 16 and the
 * Appointment Form stop being offered. Those three were dead entries — the menu
 * rendered them because the filter compared against codes that were never in the
 * catalogue, and the endpoints behind them answered 403. Hiding them is the menu
 * catching up with the API, not a loss of access.
 *
 * Existing rows are never overwritten, so a deliberate DENY survives.
 */
return new class extends Migration
{
    /**
     * Role code → the portal capability it gets.
     *
     * Only the two self-service shells. Which roles are approved for the
     * management shell is an explicit business decision and it belongs to one
     * place — 2026_08_11_000009_activate_business_portal_capability, which
     * names them. Deriving it here as "anything that is not an employee or an
     * agent" would silently overrule that allowlist.
     */
    private const PORTAL_BY_ROLE_CODE = [
        'employee' => 'ui.portals.employee',
        'emp' => 'ui.portals.employee',
        'agent' => 'ui.portals.agent',
    ];

    /**
     * Shell page → the legacy code the role must already hold to receive it.
     * A null requirement means the page's API carries no permission, so holding
     * the shell is the only condition.
     */
    private const EMPLOYEE_PAGES = [
        'ui.portals.employee_dashboard' => 'self.payslip.read',
        'ui.portals.employee_payslips' => 'self.payslip.read',
        'ui.portals.employee_form16' => 'payroll.form16.read',
        'ui.portals.employee_tickets' => 'self.ticket.read',
        'ui.portals.employee_tickets.create' => 'self.ticket.create',
        'ui.portals.employee_profile' => null,
        'ui.portals.employee_appointment' => 'hr.appointment.read',
    ];

    private const AGENT_PAGES = [
        'ui.portals.agent_dashboard' => 'ui.agent.dashboard.view',
        'ui.portals.agent_trial_forms' => 'recruitment.trial_form.read',
        'ui.portals.agent_trial_forms.create' => 'recruitment.trial_form.create',
        'ui.portals.agent_appointments' => 'hr.appointment.read',
        'ui.portals.agent_appointments.create' => 'hr.appointment.create',
        'ui.portals.employee_profile' => null,
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasColumn('permissions', 'code')) {
            return;
        }

        if (! Schema::hasTable('role_permissions') || ! Schema::hasTable('roles')) {
            return;
        }

        app(PermissionCatalogSync::class)->sync();

        $permissionIds = DB::table('permissions')->pluck('id', 'code')->all();

        if (! isset($permissionIds['ui.portals'])) {
            return;
        }

        foreach (DB::table('roles')->select('id', 'code')->get() as $role) {
            $portal = self::PORTAL_BY_ROLE_CODE[(string) $role->code] ?? null;

            if ($portal === null) {
                continue;
            }

            $this->grant((int) $role->id, $permissionIds['ui.portals'] ?? null);
            $this->grant((int) $role->id, $permissionIds[$portal] ?? null);

            $pages = match ($portal) {
                'ui.portals.employee' => self::EMPLOYEE_PAGES,
                'ui.portals.agent' => self::AGENT_PAGES,
                default => [],
            };

            foreach ($pages as $page => $requiredLegacyCode) {
                if ($requiredLegacyCode !== null && ! $this->holds((int) $role->id, $permissionIds[$requiredLegacyCode] ?? null)) {
                    continue;
                }

                $this->grant((int) $role->id, $permissionIds[$page] ?? null);
            }
        }
    }

    private function holds(int $roleId, ?int $permissionId): bool
    {
        if ($permissionId === null) {
            return false;
        }

        return DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission_id', $permissionId)
            ->where('effect', 'ALLOW')
            ->exists();
    }

    private function grant(int $roleId, ?int $permissionId): void
    {
        if ($permissionId === null) {
            return;
        }

        $exists = DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission_id', $permissionId)
            ->exists();

        if ($exists) {
            return;
        }

        DB::table('role_permissions')->insert([
            'role_id' => $roleId,
            'permission_id' => $permissionId,
            'effect' => 'ALLOW',
            'inherit_to_children' => true,
        ]);
    }

    /**
     * Not reversed.
     *
     * Dropping these would leave every non-super-admin account without a shell
     * and every employee page refused. That is a lockout, not a rollback.
     */
    public function down(): void
    {
    }
};
