<?php

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Database\Seeders\EmployeeSelfServicePermissionSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Give the Employee role back its own self-service pages.
 *
 * When the employee shell pages gained registry routes, canRoute() began
 * enforcing them — and a page a role does not hold is now hidden and blocked.
 * The backfill that came with those routes granted each page only if the role
 * already held the legacy code the page declared, which was the right instinct
 * and produced the wrong result for three of the six:
 *
 *   My Form 16          declared payroll.form16.read   (the ADMIN listing)
 *   Appointment Form    declared hr.appointment.read   (the ADMIN directory)
 *   My Tickets          declared self.ticket.read      (correct, simply not held)
 *
 * The first two were mis-declared. Granting an employee those codes to make a
 * menu entry reappear would have handed all 341 of them the administrative
 * Form 16 listing and the whole appointment directory — so the backfill
 * correctly granted nothing, and the pages disappeared instead.
 *
 * Those declarations are fixed in PermissionRegistry to name what the pages
 * actually call: Form16.jsx reads the employee dashboard (self.payslip.read)
 * and EmployeeAppointment.jsx reads the signed-in user's own profile
 * (self.profile.read). Both are already held. Tickets needed a real grant, and
 * self.ticket.* is self-scoped by definition.
 *
 * The grants live in a seeder because a migration can only reach roles that
 * already exist, and a fresh install creates them in RbacSeeder afterwards.
 * Both call the same idempotent class.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('role_permissions') || ! Schema::hasTable('permissions')) {
            return;
        }

        // The registry's implies changed, so the catalogue is resynced first.
        app(PermissionCatalogSync::class)->sync();

        (new EmployeeSelfServicePermissionSeeder())->run();
    }

    /** Not reversed: undoing it would blank the employee portal again. */
    public function down(): void
    {
    }
};
