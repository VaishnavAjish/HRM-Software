<?php

namespace App\Support;

class PermissionRegistry
{
    public const TYPE_MODULE = 'module';
    public const TYPE_PAGE = 'page';
    public const TYPE_SECTION = 'section';
    public const TYPE_FEATURE = 'feature';
    public const TYPE_ACTION = 'action';
    public const TYPE_FILTER = 'filter';
    public const TYPE_COLUMN = 'column';
    public const TYPE_FIELD = 'field';
    public const TYPE_API = 'api';

    public const SENSITIVITY_NORMAL = 'NORMAL';
    public const SENSITIVITY_SENSITIVE = 'SENSITIVE';
    public const SENSITIVITY_PRIVILEGED = 'PRIVILEGED';
    public const SENSITIVITY_CRITICAL = 'CRITICAL';

    public const SCOPE_COMPANY = 'company';
    public const SCOPE_DEPARTMENT = 'department';
    public const SCOPE_OWN = 'own';

    private static ?array $normalised = null;

    private static ?array $childIndex = null;

    /**
     * The canonical application authorization surface.
     *
     * The array key is the canonical permission code. `implies` lists the
     * pre-existing business permission codes the node projects onto, which is
     * what the `permission:` middleware and every existing controller already
     * enforce — the registry is a new editing surface over the old codes, not a
     * second authorization system. Nodes with `assignable => false` are grouping
     * rows: they carry no permission record and can never be granted.
     */
    private const NODES = [

        /* ------------------------------------------------------------ portals */

        /*
         * Which application shell an account lands in.
         *
         * The shell used to be decided by the legacy numeric tier, with one
         * escape hatch: a non-admin tier was upgraded to the administration
         * shell if it happened to hold whatever permission governs the /admin
         * route — which is ui.dashboard. That made the dashboard a load-bearing
         * dependency of every other business page. A role granted ui.hr but not
         * ui.dashboard was sent to the employee shell and could never reach HR,
         * however the Permission Matrix was configured.
         *
         * A shell is not authority. Holding the business shell says only where
         * the navigation is drawn; ui.access_control stays independently denied,
         * so a business role does not become an administrator by being rendered
         * in the same frame as one.
         *
         * Deliberately NORMAL sensitivity and no implied legacy codes: these
         * grant nothing on their own.
         */
        'ui.portals' => [
            'type' => self::TYPE_MODULE, 'label' => 'Application Shells', 'order' => 5,
            'parent' => null,
            'description' => 'Which application shell a role signs in to.',
        ],
        'ui.portals.business' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Business / Administration Shell', 'order' => 10,
            'parent' => 'ui.portals',
            'description' => 'Sign in to the management shell. Grants no page or action by itself.',
        ],
        'ui.portals.employee' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Employee Self-Service Shell', 'order' => 20,
            'parent' => 'ui.portals',
            'description' => 'Sign in to the employee self-service shell.',
        ],
        'ui.portals.agent' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Agent Shell', 'order' => 30,
            'parent' => 'ui.portals',
            'description' => 'Sign in to the agent shell.',
        ],

        /* ---------------------------------------------------------- dashboard */

        'ui.dashboard' => [
            'type' => self::TYPE_MODULE, 'label' => 'Dashboard', 'order' => 10,
            'parent' => null, 'route' => '/admin',
            'description' => 'Access the administration dashboard.',
            'implies' => ['ui.admin.dashboard.view', 'hr.dashboard.read'],
            'api' => [['GET', '/api/admin-dashboard']],
        ],
        'ui.dashboard.employee_count' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Employee Count Card', 'order' => 10,
            'parent' => 'ui.dashboard',
            'description' => 'Show the headcount summary card on the dashboard.',
            'implies' => ['dashboard.hr.employee_count.view'],
        ],
        'ui.dashboard.payroll_cost' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Payroll Cost Card', 'order' => 20,
            'parent' => 'ui.dashboard', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Show total payroll cost on the dashboard.',
            'implies' => ['dashboard.payroll.total_cost.view'],
        ],

        /* -------------------------------------------------------------- forms */

        'ui.forms' => [
            'type' => self::TYPE_MODULE, 'label' => 'Forms', 'order' => 20, 'parent' => null,
            'description' => 'Appointment and trial form workspace.',
            'implies' => [],
        ],

        'ui.forms.appointment' => [
            'type' => self::TYPE_PAGE, 'label' => 'Appointment Form', 'order' => 10,
            'parent' => 'ui.forms', 'route' => '/admin/appointments',
            'description' => 'Open the appointment form workspace.',
            'implies' => ['ui.admin.appointments.view', 'hr.appointment.read'],
            'api' => [['GET', '/api/appointment']],
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.forms.appointment.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'New Appointment', 'order' => 20,
            'parent' => 'ui.forms.appointment',
            'description' => 'Create a new appointment record.',
            'implies' => ['hr.appointment.create'],
            'api' => [['POST', '/api/appointment']],
        ],
        'ui.forms.appointment.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update', 'order' => 30,
            'parent' => 'ui.forms.appointment',
            'description' => 'Edit an existing appointment record.',
            'implies' => ['hr.appointment.update'],
        ],
        'ui.forms.appointment.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete', 'order' => 40,
            'parent' => 'ui.forms.appointment', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Delete an appointment record.',
            'implies' => ['hr.appointment.delete'],
        ],
        'ui.forms.appointment.approve' => [
            'type' => self::TYPE_ACTION, 'label' => 'Approve', 'order' => 50,
            'parent' => 'ui.forms.appointment', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Approve a submitted appointment.',
            'implies' => ['hr.appointment.approve'],
        ],
        'ui.forms.appointment.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export', 'order' => 60,
            'parent' => 'ui.forms.appointment',
            'description' => 'Export appointment records.',
            'implies' => ['hr.appointment.export'],
        ],
        'ui.forms.appointment.print' => [
            'type' => self::TYPE_ACTION, 'label' => 'Print', 'order' => 70,
            'parent' => 'ui.forms.appointment',
            'description' => 'Print an appointment record.',
            'implies' => ['hr.appointment.print'],
        ],

        'ui.forms.trial' => [
            'type' => self::TYPE_PAGE, 'label' => 'Trial Form', 'order' => 20,
            'parent' => 'ui.forms', 'route' => '/admin/trial-form',
            'description' => 'Open the trial form workspace.',
            'implies' => ['recruitment.trial_form.read'],
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.forms.trial.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'New Trial Form', 'order' => 20,
            'parent' => 'ui.forms.trial',
            'description' => 'Create a trial form entry.',
            'implies' => ['recruitment.trial_form.create'],
        ],
        'ui.forms.trial.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update', 'order' => 30,
            'parent' => 'ui.forms.trial',
            'description' => 'Edit a trial form entry.',
            'implies' => ['recruitment.trial_form.update'],
        ],
        'ui.forms.trial.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete', 'order' => 40,
            'parent' => 'ui.forms.trial', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Delete a trial form entry.',
            'implies' => ['recruitment.trial_form.delete'],
        ],

        /* ---------------------------------------------------------- employees */

        'ui.employees' => [
            'type' => self::TYPE_MODULE, 'label' => 'Employees', 'order' => 30, 'parent' => null,
            'description' => 'Employee records module.',
            'implies' => ['ui.admin.employees.view'],
            'scopes' => [self::SCOPE_COMPANY, self::SCOPE_DEPARTMENT],
        ],

        'ui.employees.master' => [
            'type' => self::TYPE_PAGE, 'label' => 'Employee Master', 'order' => 10,
            'parent' => 'ui.employees', 'route' => '/admin/employees/add',
            'description' => 'Open the employee master record workspace.',
            'implies' => ['hr.employee.read'],
            'api' => [['GET', '/api/employee/get']],
            'scopes' => [self::SCOPE_COMPANY, self::SCOPE_DEPARTMENT, self::SCOPE_OWN],
        ],
        'ui.employees.master.list' => [
            'type' => self::TYPE_FEATURE, 'label' => 'View / List', 'order' => 10,
            'parent' => 'ui.employees.master',
            'description' => 'List employee records.',
            'implies' => ['hr.employee.read'],
            'api' => [['GET', '/api/employee/get']],
        ],
        'ui.employees.master.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Employee', 'order' => 20,
            'parent' => 'ui.employees.master',
            'description' => 'Create a new employee record.',
            'implies' => ['hr.employee.create'],
            'api' => [['POST', '/api/employee/store']],
        ],
        'ui.employees.master.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Employee', 'order' => 30,
            'parent' => 'ui.employees.master',
            'description' => 'Update an existing employee record.',
            'implies' => ['hr.employee.update'],
            'api' => [['PUT', '/api/employee/edit/{id}']],
        ],
        'ui.employees.master.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Employee', 'order' => 40,
            'parent' => 'ui.employees.master', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Allows user to delete or deactivate an employee record.',
            'implies' => ['hr.employee.delete'],
            'api' => [['GET', '/api/employee/delete/{id}']],
        ],
        'ui.employees.master.import' => [
            'type' => self::TYPE_ACTION, 'label' => 'Import', 'order' => 50,
            'parent' => 'ui.employees.master', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Bulk import employee records.',
            'implies' => ['hr.employee.import'],
        ],
        'ui.employees.master.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export', 'order' => 60,
            'parent' => 'ui.employees.master', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Export employee records.',
            'implies' => ['hr.employee.export'],
        ],
        'ui.employees.master.print' => [
            'type' => self::TYPE_ACTION, 'label' => 'Print', 'order' => 70,
            'parent' => 'ui.employees.master',
            'description' => 'Print an employee record.',
            'implies' => ['hr.employee.print'],
        ],

        'ui.employees.master.filters' => [
            'type' => self::TYPE_SECTION, 'label' => 'Filters', 'order' => 80,
            'parent' => 'ui.employees.master', 'assignable' => false,
            'description' => 'Filter controls available on the employee master table.',
        ],
        /*
         * The filter and column nodes are DECLARED BUT NOT ENFORCED.
         *
         * Every one of them is marked deprecated, and that is a statement of
         * fact rather than a plan to remove them. Nothing reads them: a search
         * of the frontend returns zero references to any of the fourteen codes,
         * and no backend serialiser consults them either — FieldSecurity exists
         * but is not wired to the employee listing.
         *
         * They had already been configured. Admin and HR Manager hold most of
         * these columns and deliberately NOT salary, bank_account or aadhaar —
         * an administrator restricted three sensitive columns in the Permission
         * Matrix and the application went on showing them. A permission that
         * silently does nothing is worse than an absent one, because it reports
         * a restriction that is not there.
         *
         * They also do not describe the screen as built. The Employee Master
         * table renders Photo, Emp Code, Punching No, Name, Stage, Department,
         * Company/Unit and Status; salary, bank details and Aadhaar appear in
         * the detail modal, not as columns. Wiring these faithfully means giving
         * that table a configurable column model and redacting the fields
         * server-side — the second half being the part that matters, since
         * hiding a column the API still returns is not data security.
         *
         * Deprecating removes them from the snapshot and marks them inactive in
         * the catalogue, so the Matrix stops offering a control that does
         * nothing. The existing grants are left in place and become explicitly
         * inert rather than implicitly so. Undeprecate them when the column
         * model and the server-side redaction land together.
         */
        'ui.employees.master.filter.company' => [
            'type' => self::TYPE_FILTER, 'label' => 'Company', 'order' => 10, 'deprecated' => true,
            'parent' => 'ui.employees.master.filters',
            'description' => 'Filter employees by company.',
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.employees.master.filter.department' => [
            'type' => self::TYPE_FILTER, 'label' => 'Department', 'order' => 20, 'deprecated' => true,
            'parent' => 'ui.employees.master.filters',
            'description' => 'Filter employees by department.',
            'implies' => ['hr.department.read'],
        ],
        'ui.employees.master.filter.designation' => [
            'type' => self::TYPE_FILTER, 'label' => 'Designation', 'order' => 30, 'deprecated' => true,
            'parent' => 'ui.employees.master.filters',
            'description' => 'Filter employees by designation.',
        ],
        'ui.employees.master.filter.status' => [
            'type' => self::TYPE_FILTER, 'label' => 'Employee Status', 'order' => 40, 'deprecated' => true,
            'parent' => 'ui.employees.master.filters',
            'description' => 'Filter employees by employment status.',
        ],

        'ui.employees.master.columns' => [
            'type' => self::TYPE_SECTION, 'label' => 'Table Columns', 'order' => 90,
            'parent' => 'ui.employees.master', 'assignable' => false,
            'description' => 'Columns rendered on the employee master table.',
        ],
        'ui.employees.master.column.emp_id' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Employee ID', 'order' => 10, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns',
            'description' => 'Show the employee identifier column.',
        ],
        'ui.employees.master.column.name' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Employee Name', 'order' => 20, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns',
            'description' => 'Show the employee name column.',
        ],
        'ui.employees.master.column.department' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Department', 'order' => 30, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns',
            'description' => 'Show the department column.',
        ],
        'ui.employees.master.column.designation' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Designation', 'order' => 40, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns',
            'description' => 'Show the designation column.',
        ],
        'ui.employees.master.column.email' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Email', 'order' => 50, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Show the email column.',
        ],
        'ui.employees.master.column.phone' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Phone', 'order' => 60, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Show the phone column.',
        ],
        'ui.employees.master.column.salary' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Salary', 'order' => 70, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Reveal the salary column and salary values in exports and reports.',
            'implies' => ['hr.employee.salary.read'],
        ],
        'ui.employees.master.column.bank_account' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Bank Details', 'order' => 80, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Reveal employee bank account details.',
            'implies' => ['hr.employee.bank_account.reveal'],
        ],
        'ui.employees.master.column.aadhaar' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Aadhaar / Tax ID', 'order' => 90, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Reveal the employee Aadhaar number.',
            'implies' => ['hr.employee.aadhaar.reveal'],
        ],
        'ui.employees.master.column.status' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Status', 'order' => 100, 'deprecated' => true,
            'parent' => 'ui.employees.master.columns',
            'description' => 'Show the employment status column.',
        ],

        'ui.employees.view' => [
            'type' => self::TYPE_PAGE, 'label' => 'View Employees', 'order' => 20,
            'parent' => 'ui.employees', 'route' => '/admin/employees',
            'description' => 'Open the employee directory.',
            'implies' => ['hr.employee.read'],
            'scopes' => [self::SCOPE_COMPANY, self::SCOPE_DEPARTMENT],
        ],

        /* ------------------------------------------------------------- salary */

        'ui.salary' => [
            'type' => self::TYPE_MODULE, 'label' => 'Salary', 'order' => 40, 'parent' => null,
            'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Payroll and salary module.',
            'implies' => ['ui.admin.salary.view'],
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.salary.batch' => [
            'type' => self::TYPE_PAGE, 'label' => 'Month & Batch Details', 'order' => 10,
            'parent' => 'ui.salary', 'route' => '/admin/salary',
            'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Open the monthly payroll batch workspace.',
            'implies' => ['payroll.payslip.read'],
            'api' => [['GET', '/api/salary-slip/get']],
        ],
        'ui.salary.batch.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Payslip', 'order' => 20,
            'parent' => 'ui.salary.batch', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Create payslip records.',
            'implies' => ['payroll.payslip.create'],
        ],
        'ui.salary.batch.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Payslip', 'order' => 30,
            'parent' => 'ui.salary.batch', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Update payslip records.',
            'implies' => ['payroll.payslip.update'],
        ],
        'ui.salary.batch.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Payslip', 'order' => 40,
            'parent' => 'ui.salary.batch', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete payslip records.',
            'implies' => ['payroll.payslip.delete'],
        ],
        'ui.salary.batch.execute' => [
            'type' => self::TYPE_ACTION, 'label' => 'Run Payroll', 'order' => 50,
            'parent' => 'ui.salary.batch', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Execute a payroll run.',
            'implies' => ['payroll.run.execute'],
        ],
        'ui.salary.batch.approve' => [
            'type' => self::TYPE_ACTION, 'label' => 'Approve Payroll', 'order' => 60,
            'parent' => 'ui.salary.batch', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Approve a payroll run.',
            'implies' => ['payroll.run.approve'],
        ],
        'ui.salary.batch.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export', 'order' => 70,
            'parent' => 'ui.salary.batch', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Export payroll reports.',
            'implies' => ['payroll.report.export'],
        ],
        'ui.salary.batch.print' => [
            'type' => self::TYPE_ACTION, 'label' => 'Print', 'order' => 80,
            'parent' => 'ui.salary.batch', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Print payroll reports.',
            'implies' => ['payroll.report.print'],
        ],
        'ui.salary.upload' => [
            'type' => self::TYPE_PAGE, 'label' => 'Salary Upload', 'order' => 20,
            'parent' => 'ui.salary', 'route' => '/admin/salary/upload',
            'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Upload a salary sheet for a payroll batch.',
            'implies' => ['payroll.payslip.create'],
        ],

        /* --------------------------------------------------------- attendance */

        'ui.attendance' => [
            'type' => self::TYPE_MODULE, 'label' => 'Attendance', 'order' => 50, 'parent' => null,
            'description' => 'Attendance and shift module.',
            'implies' => ['ui.admin.attendance.view'],
            'scopes' => [self::SCOPE_COMPANY, self::SCOPE_DEPARTMENT],
        ],
        'ui.attendance.view' => [
            'type' => self::TYPE_PAGE, 'label' => 'View Attendance', 'order' => 10,
            'parent' => 'ui.attendance', 'route' => '/admin/attendance',
            'description' => 'Open the attendance register.',
            'implies' => ['hr.attendance.read'],
        ],
        'ui.attendance.view.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update', 'order' => 20,
            'parent' => 'ui.attendance.view',
            'description' => 'Correct attendance entries.',
            'implies' => ['hr.attendance.update'],
        ],
        'ui.attendance.view.import' => [
            'type' => self::TYPE_ACTION, 'label' => 'Import', 'order' => 30,
            'parent' => 'ui.attendance.view', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Import attendance from a device or sheet.',
            'implies' => ['hr.attendance.import'],
        ],
        'ui.attendance.shift' => [
            'type' => self::TYPE_PAGE, 'label' => 'Shift', 'order' => 20,
            'parent' => 'ui.attendance', 'route' => '/admin/attendance/shift',
            'description' => 'Open shift management.',
            'implies' => ['hr.shift.read'],
        ],
        'ui.attendance.shift.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create', 'order' => 10,
            'parent' => 'ui.attendance.shift',
            'description' => 'Create a shift.',
            'implies' => ['hr.shift.create'],
        ],
        'ui.attendance.shift.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update', 'order' => 20,
            'parent' => 'ui.attendance.shift',
            'description' => 'Update a shift.',
            'implies' => ['hr.shift.update'],
        ],
        'ui.attendance.shift.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete', 'order' => 30,
            'parent' => 'ui.attendance.shift', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Delete a shift.',
            'implies' => ['hr.shift.delete'],
        ],
        'ui.attendance.shift.assign' => [
            'type' => self::TYPE_ACTION, 'label' => 'Assign', 'order' => 40,
            'parent' => 'ui.attendance.shift',
            'description' => 'Assign employees to a shift.',
            'implies' => ['hr.shift.assign'],
        ],

        /* ---------------------------------------------------------------- tds */

        'ui.tds' => [
            'type' => self::TYPE_MODULE, 'label' => 'TDS', 'order' => 60, 'parent' => null,
            'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Tax deduction module.',
            'implies' => ['ui.admin.tds.view'],
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.tds.calculation' => [
            'type' => self::TYPE_PAGE, 'label' => 'TDS Calculation', 'order' => 10,
            'parent' => 'ui.tds', 'route' => '/admin/tds/calculation',
            'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Open the TDS calculation workspace.',
            'implies' => ['ui.admin.tds.view'],
        ],
        'ui.tds.form16' => [
            'type' => self::TYPE_PAGE, 'label' => 'Form 16', 'order' => 20,
            'parent' => 'ui.tds', 'route' => '/admin/form16',
            'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Open Form 16 generation.',
            'implies' => ['ui.admin.form16.view', 'payroll.form16.read'],
        ],
        'ui.tds.form16.download' => [
            'type' => self::TYPE_ACTION, 'label' => 'Download', 'order' => 10,
            'parent' => 'ui.tds.form16', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Download generated Form 16 documents.',
            'implies' => ['document.file.download'],
        ],

        /* ----------------------------------------------------------------- hr */

        'ui.hr' => [
            'type' => self::TYPE_MODULE, 'label' => 'HR', 'order' => 70, 'parent' => null,
            'description' => 'Human resources module.',
            'implies' => ['hr.dashboard.read'],
            'scopes' => [self::SCOPE_COMPANY, self::SCOPE_DEPARTMENT],
        ],
        'ui.hr.dashboard' => [
            'type' => self::TYPE_PAGE, 'label' => 'HR Dashboard', 'order' => 10,
            'parent' => 'ui.hr', 'route' => '/admin/hr',
            'description' => 'Open the HR dashboard.',
            'implies' => ['hr.dashboard.read'],
        ],
        'ui.hr.hiring' => [
            'type' => self::TYPE_PAGE, 'label' => 'Hiring', 'order' => 20,
            'parent' => 'ui.hr', 'route' => '/admin/hr/hiring',
            'description' => 'Open the hiring pipeline.',
            'implies' => ['hr.requisition.read'],
        ],
        'ui.hr.hiring.requisition_create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Requisition', 'order' => 10,
            'parent' => 'ui.hr.hiring',
            'description' => 'Raise a hiring requisition.',
            'implies' => ['hr.requisition.create'],
        ],
        'ui.hr.hiring.requisition_publish' => [
            'type' => self::TYPE_ACTION, 'label' => 'Publish Requisition', 'order' => 20,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Publish a requisition for applications.',
            'implies' => ['hr.requisition.publish'],
        ],
        'ui.hr.hiring.requisition_approve' => [
            'type' => self::TYPE_ACTION, 'label' => 'Approve Requisition', 'order' => 30,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Approve a hiring requisition.',
            'implies' => ['hr.requisition.approve'],
        ],
        'ui.hr.hiring.requisition_submit' => [
            'type' => self::TYPE_ACTION, 'label' => 'Submit Requisition', 'order' => 32,
            'parent' => 'ui.hr.hiring',
            'description' => 'Submit a requisition into the two-stage approval workflow.',
            'implies' => ['hr.requisition.submit'],
            'api' => [
                ['GET', '/api/hr/requisitions/approval-options'],
                ['POST', '/api/hr/requisitions/{id}/submit'],
            ],
        ],
        'ui.hr.hiring.requisition_withdraw' => [
            'type' => self::TYPE_ACTION, 'label' => 'Withdraw Requisition', 'order' => 34,
            'parent' => 'ui.hr.hiring',
            'description' => 'Withdraw a pending requisition back to draft.',
            'implies' => ['hr.requisition.withdraw'],
            'api' => [['POST', '/api/hr/requisitions/{id}/withdraw']],
        ],
        'ui.hr.hiring.hr_manager_review' => [
            'type' => self::TYPE_FEATURE, 'label' => 'HR Manager Review', 'order' => 36,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Open the HR Manager requisition review queue.',
            'implies' => ['hr.requisition.hr_manager.read'],
            'api' => [['GET', '/api/hr/requisitions/hr-manager-queue']],
        ],
        'ui.hr.hiring.hr_manager_review.decide' => [
            'type' => self::TYPE_ACTION, 'label' => 'HR Manager Decision', 'order' => 10,
            'parent' => 'ui.hr.hiring.hr_manager_review', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Forward to Director or Return to Department Head.',
            'implies' => ['hr.requisition.hr_manager.decide'],
            'api' => [
                ['POST', '/api/hr/requisitions/{id}/hr-manager/forward'],
                ['POST', '/api/hr/requisitions/{id}/hr-manager/return-to-department-head'],
                ['POST', '/api/hr/requisitions/{id}/hr-manager/respond-to-director'],
            ],
        ],
        'ui.hr.hiring.hiring_manager_review' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Hiring Manager Review', 'order' => 37,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Legacy alias for HR Manager requisition review queue.',
            'implies' => ['hr.requisition.hiring_manager.read', 'hr.requisition.hr_manager.read'],
            'api' => [['GET', '/api/hr/requisitions/hiring-manager-queue']],
        ],
        'ui.hr.hiring.hiring_manager_review.decide' => [
            'type' => self::TYPE_ACTION, 'label' => 'Hiring Manager Decision', 'order' => 10,
            'parent' => 'ui.hr.hiring.hiring_manager_review', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Legacy alias for HR Manager decision.',
            'implies' => ['hr.requisition.hiring_manager.decide', 'hr.requisition.hr_manager.decide'],
            'api' => [['POST', '/api/hr/requisitions/{id}/hiring-manager/decision']],
        ],
        'ui.hr.hiring.job_portal' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Job Portal Queue', 'order' => 39,
            'parent' => 'ui.hr.hiring',
            'description' => 'Open the Job Portal publishing queue.',
            'implies' => ['hr.requisition.job_portal.read'],
            'api' => [['GET', '/api/hr/requisitions/job-portal-queue']],
        ],
        'ui.hr.hiring.job_portal.publish' => [
            'type' => self::TYPE_ACTION, 'label' => 'Job Portal Publish', 'order' => 10,
            'parent' => 'ui.hr.hiring.job_portal', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Publish, unpublish, or close job requisitions on the public Job Portal.',
            'implies' => ['hr.requisition.job_portal.publish'],
            'api' => [
                ['POST', '/api/hr/requisitions/{id}/portal/publish'],
                ['POST', '/api/hr/requisitions/{id}/portal/unpublish'],
                ['POST', '/api/hr/requisitions/{id}/close'],
            ],
        ],
        'ui.hr.hiring.department_override' => [
            'type' => self::TYPE_ACTION, 'label' => 'Department Override', 'order' => 11,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Create requisitions for another department.',
            'implies' => ['hr.requisition.department.override'],
        ],
        'ui.hr.hiring.director_review' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Director Review', 'order' => 38,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Open the Director requisition review queue.',
            'implies' => ['hr.requisition.director.read'],
            'api' => [['GET', '/api/hr/requisitions/director-queue']],
        ],
        'ui.hr.hiring.director_review.decide' => [
            'type' => self::TYPE_ACTION, 'label' => 'Director Decision', 'order' => 10,
            'parent' => 'ui.hr.hiring.director_review', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Give the final approval or rejection for an assigned requisition.',
            'implies' => ['hr.requisition.director.decide'],
            'api' => [['POST', '/api/hr/requisitions/{id}/director/decision']],
        ],
        'ui.hr.hiring.candidates' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Candidates', 'order' => 40,
            'parent' => 'ui.hr.hiring',
            'description' => 'View the candidate pipeline.',
            'implies' => ['hr.candidate.read'],
        ],
        'ui.hr.hiring.candidates.tags' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Candidate Tags', 'order' => 41,
            'parent' => 'ui.hr.hiring.candidates',
            'description' => 'Create and manage candidate tags, and tag candidates with them.',
            'implies' => ['hr.candidate.tag'],
        ],
        'ui.hr.hiring.candidates.notes' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Candidate Notes', 'order' => 42,
            'parent' => 'ui.hr.hiring.candidates',
            'description' => 'Read and write the private recruiter note trail on a candidate.',
            'implies' => ['hr.candidate.note'],
        ],
        'ui.hr.hiring.candidates.communication' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Candidate Communication', 'order' => 44,
            'parent' => 'ui.hr.hiring.candidates', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Compose and send candidate messages, and view the communication log.',
            'implies' => ['hr.candidate.communication'],
        ],
        'ui.hr.hiring.candidate_create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Add Candidate', 'order' => 50,
            'parent' => 'ui.hr.hiring',
            'description' => 'Add a candidate to the pipeline.',
            'implies' => ['hr.candidate.create'],
        ],
        'ui.hr.hiring.candidate_move_stage' => [
            'type' => self::TYPE_ACTION, 'label' => 'Move Stage', 'order' => 60,
            'parent' => 'ui.hr.hiring',
            'description' => 'Move a candidate between pipeline stages.',
            'implies' => ['hr.candidate.move_stage'],
        ],
        'ui.hr.hiring.candidate_export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export Candidates', 'order' => 70,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Export candidate records.',
            'implies' => ['hr.candidate.export'],
        ],
        'ui.hr.hiring.assessment' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Assessments', 'order' => 75,
            'parent' => 'ui.hr.hiring',
            'description' => 'View assigned assessments and their results.',
            'implies' => ['assessment.view', 'hr.training.read'],
        ],
        'ui.hr.hiring.assessment_assign' => [
            'type' => self::TYPE_ACTION, 'label' => 'Assign & Send Assessment', 'order' => 76,
            'parent' => 'ui.hr.hiring.assessment',
            'description' => 'Assign an assessment to a candidate, preview the invitation, and send or resend it.',
            'implies' => ['assessment.assign', 'assessment.preview_email', 'assessment.send_invitation', 'assessment.resend_invitation'],
        ],
        'ui.hr.hiring.assessment_revoke' => [
            'type' => self::TYPE_ACTION, 'label' => 'Revoke Assessment', 'order' => 77,
            'parent' => 'ui.hr.hiring.assessment', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Revoke a candidate\'s assessment access.',
            'implies' => ['assessment.revoke'],
        ],
        'ui.hr.hiring.interviews' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Interviews', 'order' => 80,
            'parent' => 'ui.hr.hiring',
            'description' => 'View and manage interviews.',
            'implies' => ['hr.interview.read'],
        ],
        'ui.hr.hiring.interview_feedback' => [
            'type' => self::TYPE_ACTION, 'label' => 'Interview Feedback', 'order' => 90,
            'parent' => 'ui.hr.hiring',
            'description' => 'Record interview feedback.',
            'implies' => ['hr.interview.feedback'],
        ],
        'ui.hr.hiring.offers' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Offers', 'order' => 100,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'View offer records.',
            'implies' => ['hr.offer.read'],
        ],
        'ui.hr.hiring.offer_release' => [
            'type' => self::TYPE_ACTION, 'label' => 'Release Offer', 'order' => 110,
            'parent' => 'ui.hr.hiring', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Release an offer to a candidate.',
            'implies' => ['hr.offer.release'],
        ],
        'ui.hr.onboarding' => [
            'type' => self::TYPE_PAGE, 'label' => 'Onboarding', 'order' => 30,
            'parent' => 'ui.hr', 'route' => '/admin/hr/onboarding',
            'description' => 'Open the onboarding workspace.',
            'implies' => ['hr.onboarding.read'],
        ],
        'ui.hr.onboarding.documents' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Documents', 'order' => 10,
            'parent' => 'ui.hr.onboarding', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'View onboarding documents.',
            'implies' => ['document.file.read'],
        ],
        'ui.hr.onboarding.document_upload' => [
            'type' => self::TYPE_ACTION, 'label' => 'Upload Document', 'order' => 20,
            'parent' => 'ui.hr.onboarding',
            'description' => 'Upload an onboarding document.',
            'implies' => ['document.file.upload'],
        ],
        'ui.hr.onboarding.document_download' => [
            'type' => self::TYPE_ACTION, 'label' => 'Download Document', 'order' => 30,
            'parent' => 'ui.hr.onboarding', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Download an onboarding document.',
            'implies' => ['document.file.download'],
        ],
        'ui.hr.onboarding.document_delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Document', 'order' => 40,
            'parent' => 'ui.hr.onboarding', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete an onboarding document.',
            'implies' => ['document.file.delete'],
        ],
        'ui.hr.assets' => [
            'type' => self::TYPE_PAGE, 'label' => 'Asset Allocation', 'order' => 40,
            'parent' => 'ui.hr', 'route' => '/admin/hr/assets',
            'description' => 'Open asset allocation.',
            'implies' => ['hr.asset.read'],
        ],
        'ui.hr.assets.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Asset', 'order' => 10,
            'parent' => 'ui.hr.assets',
            'description' => 'Register a new asset.',
            'implies' => ['hr.asset.create'],
        ],
        'ui.hr.assets.allocate' => [
            'type' => self::TYPE_ACTION, 'label' => 'Allocate', 'order' => 20,
            'parent' => 'ui.hr.assets',
            'description' => 'Allocate an asset to an employee.',
            'implies' => ['hr.asset.allocate'],
        ],
        'ui.hr.assets.return' => [
            'type' => self::TYPE_ACTION, 'label' => 'Return', 'order' => 30,
            'parent' => 'ui.hr.assets',
            'description' => 'Record an asset return.',
            'implies' => ['hr.asset.return'],
        ],
        'ui.hr.assets.transfer' => [
            'type' => self::TYPE_ACTION, 'label' => 'Transfer', 'order' => 40,
            'parent' => 'ui.hr.assets',
            'description' => 'Transfer an asset between employees.',
            'implies' => ['hr.asset.transfer'],
        ],
        'ui.hr.assets.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Asset', 'order' => 50,
            'parent' => 'ui.hr.assets', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Delete an asset record.',
            'implies' => ['hr.asset.delete'],
        ],
        'ui.hr.assets.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export', 'order' => 60,
            'parent' => 'ui.hr.assets',
            'description' => 'Export the asset register.',
            'implies' => ['hr.asset.export'],
        ],
        'ui.hr.performance' => [
            'type' => self::TYPE_PAGE, 'label' => 'Performance Matrix', 'order' => 50,
            'parent' => 'ui.hr', 'route' => '/admin/hr/performance',
            'description' => 'Open the performance matrix.',
            'implies' => ['hr.performance.read'],
        ],
        'ui.hr.performance.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Review Cycle', 'order' => 10,
            'parent' => 'ui.hr.performance',
            'description' => 'Create a performance review cycle.',
            'implies' => ['hr.performance.create'],
        ],
        'ui.hr.performance.review' => [
            'type' => self::TYPE_ACTION, 'label' => 'Submit Review', 'order' => 20,
            'parent' => 'ui.hr.performance', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Submit a performance review.',
            'implies' => ['hr.performance.review'],
        ],
        'ui.hr.performance.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export', 'order' => 30,
            'parent' => 'ui.hr.performance', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Export performance data.',
            'implies' => ['hr.performance.export'],
        ],
        'ui.hr.exit' => [
            'type' => self::TYPE_PAGE, 'label' => 'Exit Management', 'order' => 60,
            'parent' => 'ui.hr', 'route' => '/admin/hr/exit',
            'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Open exit management.',
            'implies' => ['hr.exit.read'],
        ],
        'ui.hr.exit.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Initiate Exit', 'order' => 10,
            'parent' => 'ui.hr.exit', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Initiate an employee exit.',
            'implies' => ['hr.exit.create'],
        ],
        'ui.hr.exit.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Exit', 'order' => 20,
            'parent' => 'ui.hr.exit', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Update an exit record.',
            'implies' => ['hr.exit.update'],
        ],
        'ui.hr.reports' => [
            'type' => self::TYPE_PAGE, 'label' => 'HR Reports', 'order' => 70,
            'parent' => 'ui.hr', 'route' => '/admin/hr/reports',
            'description' => 'Open HR reporting.',
            'implies' => ['hr.report.read'],
        ],
        'ui.hr.reports.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export', 'order' => 10,
            'parent' => 'ui.hr.reports', 'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Export HR reports.',
            'implies' => ['hr.report.export'],
        ],
        'ui.hr.settings' => [
            'type' => self::TYPE_PAGE, 'label' => 'HR Settings', 'order' => 80,
            'parent' => 'ui.hr', 'route' => '/admin/hr/settings',
            'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Open HR configuration.',
            'implies' => ['hr.hr_settings.read'],
        ],

        /* ------------------------------------------------------------ tickets */

        'ui.tickets' => [
            'type' => self::TYPE_MODULE, 'label' => 'Ticket Control Center', 'order' => 80,
            'parent' => null, 'route' => '/admin/tickets',
            'description' => 'Support ticket workspace.',
            'implies' => ['support.ticket.read'],
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.tickets.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Ticket', 'order' => 10,
            'parent' => 'ui.tickets',
            'description' => 'Update a support ticket.',
            'implies' => ['support.ticket.update'],
        ],
        'ui.tickets.assign' => [
            'type' => self::TYPE_ACTION, 'label' => 'Assign Ticket', 'order' => 20,
            'parent' => 'ui.tickets',
            'description' => 'Assign a support ticket to an agent.',
            'implies' => ['support.ticket.assign'],
        ],

        /* --------------------------------------------------------- reporting */

        'ui.reports' => [
            'type' => self::TYPE_MODULE, 'label' => 'Reports', 'order' => 85,
            'parent' => null, 'route' => '/admin/reports',
            'description' => 'Reporting workspace.',
            'implies' => ['ui.admin.reports.view'],
            'scopes' => [self::SCOPE_COMPANY],
        ],

        /* ----------------------------------------------------------- portals */

        /*
         * The employee and agent shells, page by page.
         *
         * Every page in both shells now declares its route, so canRoute() and
         * the sidebar filter resolve them through the same registry the matrix
         * edits. Before this they declared none, and the browser filtered those
         * two menus against eight codes — employee_dashboard, employee_payslips,
         * agent_trial_form and the rest — that were never in the catalogue. The
         * lookup therefore returned undefined, `undefined !== "no_access"` is
         * true, and every entry rendered unconditionally. Both shells had a
         * fixed menu that no permission could change and no URL that could be
         * refused.
         *
         * Declaring a route re-opens a trap worth naming: a portal landing page
         * that is denied used to redirect to the portal home, which was the page
         * that had just been refused, and React Router rendered nothing. That is
         * handled — ProtectedRoute renders AccessDenied when the redirect target
         * is the current path — but it is why these routes have to arrive with
         * the backfill that grants them, never on their own.
         *
         * `implies` names the legacy code the API already enforces, so a page
         * the matrix allows is a page whose endpoints answer, and one it denies
         * is refused at both ends rather than only hidden.
         */
        'ui.portals.agent_dashboard' => [
            'type' => self::TYPE_PAGE, 'label' => 'Agent Dashboard', 'order' => 10,
            'parent' => 'ui.portals', 'route' => '/agent',
            'description' => 'Open the agent portal dashboard.',
            // The dashboard's primary data call is GET /agent/candidates, gated
            // on recruitment.candidate.read — without it here the matrix can
            // show the page as allowed while its data answers 403.
            'implies' => ['ui.agent.dashboard.view', 'recruitment.candidate.read'],
        ],
        'ui.portals.agent_trial_forms' => [
            'type' => self::TYPE_PAGE, 'label' => 'Agent Trial Forms', 'order' => 12,
            'parent' => 'ui.portals', 'route' => '/agent/trial-forms',
            'description' => 'Open the agent trial form workspace.',
            // The trial form's department picker calls GET /department/get, now
            // gated on hr.department.read — imply it so the matrix can show the
            // page as allowed only when its data actually answers.
            'implies' => ['recruitment.trial_form.read', 'hr.department.read'],
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.portals.agent_trial_forms.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Submit Trial Form', 'order' => 10,
            'parent' => 'ui.portals.agent_trial_forms',
            'description' => 'Submit a trial form from the agent shell.',
            'implies' => ['recruitment.trial_form.create'],
        ],
        'ui.portals.agent_appointments' => [
            'type' => self::TYPE_PAGE, 'label' => 'Agent Appointments', 'order' => 14,
            'parent' => 'ui.portals', 'route' => '/agent/appointments',
            'description' => 'Open the agent appointment form.',
            // The appointment form's department picker calls GET /department/get,
            // now gated on hr.department.read — imply it here too.
            'implies' => ['hr.appointment.read', 'hr.department.read'],
            'scopes' => [self::SCOPE_COMPANY],
        ],
        'ui.portals.agent_appointments.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Submit Appointment', 'order' => 10,
            'parent' => 'ui.portals.agent_appointments',
            'description' => 'Submit an appointment from the agent shell.',
            'implies' => ['hr.appointment.create'],
        ],
        'ui.portals.employee_dashboard' => [
            'type' => self::TYPE_PAGE, 'label' => 'Employee Dashboard', 'order' => 20,
            'parent' => 'ui.portals', 'route' => '/employee',
            'description' => 'Open the employee self-service dashboard.',
            'implies' => ['ui.employee.dashboard.view', 'self.payslip.read'],
            'api' => [['GET', '/api/dashboard']],
        ],
        'ui.portals.employee_payslips' => [
            'type' => self::TYPE_PAGE, 'label' => 'My Payslips', 'order' => 22,
            'parent' => 'ui.portals', 'route' => '/employee/payslips',
            'description' => 'Open the employee payslip list.',
            'implies' => ['self.payslip.read'],
        ],
        'ui.portals.employee_form16' => [
            'type' => self::TYPE_PAGE, 'label' => 'My Form 16', 'order' => 24,
            'parent' => 'ui.portals', 'route' => '/employee/form16',
            'sensitivity' => self::SENSITIVITY_SENSITIVE,
            'description' => 'Open the employee Form 16 page.',
            /*
             * The self-service read, not the payroll one.
             *
             * This implied payroll.form16.read, which guards the ADMINISTRATIVE
             * Form 16 employee listing — a code no employee should hold. The
             * effect was that the page could only be granted by handing every
             * employee an admin capability, so it was granted to nobody and the
             * menu entry disappeared for all 341 of them.
             *
             * pages/employee/Form16.jsx calls salaryApi.getEmployeeDashboard,
             * which is guarded by self.payslip.read. That is the code the page
             * actually depends on, so that is what it implies.
             */
            'implies' => ['self.payslip.read'],
        ],
        'ui.portals.employee_tickets' => [
            'type' => self::TYPE_PAGE, 'label' => 'My Tickets', 'order' => 26,
            'parent' => 'ui.portals', 'route' => '/employee/tickets',
            'description' => 'Open the employee support ticket list.',
            'implies' => ['self.ticket.read'],
            'api' => [['GET', '/api/tickets/get']],
        ],
        'ui.portals.employee_tickets.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Raise Ticket', 'order' => 10,
            'parent' => 'ui.portals.employee_tickets',
            'description' => 'Raise or reply to a support ticket.',
            'implies' => ['self.ticket.create'],
            'api' => [['POST', '/api/tickets/store']],
        ],
        'ui.portals.employee_profile' => [
            'type' => self::TYPE_PAGE, 'label' => 'My Profile', 'order' => 28,
            'parent' => 'ui.portals', 'route' => '/employee/profile',
            'description' => 'Open the employee profile page.',
            'implies' => ['self.profile.read'],
            'api' => [['GET', '/api/profile']],
        ],
        'ui.portals.employee_profile.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Edit Own Profile', 'order' => 10,
            'parent' => 'ui.portals.employee_profile',
            'description' => 'Edit own profile details.',
            'implies' => ['self.profile.update'],
            'api' => [['POST', '/api/profile-update']],
        ],
        'ui.portals.employee_appointment' => [
            'type' => self::TYPE_PAGE, 'label' => 'Employee Appointment Form', 'order' => 30,
            'parent' => 'ui.portals', 'route' => '/employee/appointment',
            'description' => 'Open the appointment form from the employee shell.',
            /*
             * The employee's own profile, not the appointment directory.
             *
             * This implied hr.appointment.read, which guards the administrative
             * appointment list — granting it to the Employee role would let
             * every employee read every appointment in the company. So it was
             * correctly granted to nobody, and the page vanished from the
             * employee menu instead.
             *
             * pages/employee/EmployeeAppointment.jsx calls authApi.getProfile
             * and nothing else: the form is prefilled from the signed-in user's
             * own record. self.profile.read is the capability it needs.
             */
            'implies' => ['self.profile.read'],
        ],

        /* ----------------------------------------------------- access control */

        'ui.access_control' => [
            'type' => self::TYPE_MODULE, 'label' => 'Access Control', 'order' => 90,
            'parent' => null, 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Authorization administration module.',
            'implies' => ['ui.admin.authorization.view'],
        ],
        'ui.access_control.users' => [
            'type' => self::TYPE_PAGE, 'label' => 'Users', 'order' => 10,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/users',
            'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Open the user directory.',
            'implies' => ['admin.user.read'],
        ],
        'ui.access_control.users.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create User', 'order' => 10,
            'parent' => 'ui.access_control.users', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Create a user account.',
            'implies' => ['admin.user.create'],
        ],
        'ui.access_control.users.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update User', 'order' => 20,
            'parent' => 'ui.access_control.users', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Update a user account.',
            'implies' => ['admin.user.update'],
        ],
        'ui.access_control.users.lock' => [
            'type' => self::TYPE_ACTION, 'label' => 'Lock / Unlock', 'order' => 30,
            'parent' => 'ui.access_control.users', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Lock or unlock a user account.',
            'implies' => ['admin.user.lock', 'admin.user.unlock'],
        ],
        'ui.access_control.users.reset_password' => [
            'type' => self::TYPE_ACTION, 'label' => 'Reset Password', 'order' => 40,
            'parent' => 'ui.access_control.users', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Reset another user password.',
            'implies' => ['admin.user.reset_password'],
        ],
        'ui.access_control.users.assign_role' => [
            'type' => self::TYPE_ACTION, 'label' => 'Assign Role', 'order' => 50,
            'parent' => 'ui.access_control.users', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Assign a role to a user. Protected hierarchy rules still apply.',
            'implies' => ['admin.user.assign_role'],
        ],
        'ui.access_control.users.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete User', 'order' => 60,
            'parent' => 'ui.access_control.users', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete a user account.',
            'implies' => ['admin.user.delete'],
        ],
        'ui.access_control.roles' => [
            'type' => self::TYPE_PAGE, 'label' => 'Roles', 'order' => 20,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/roles',
            'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Open role management.',
            'implies' => ['admin.role.read'],
        ],
        'ui.access_control.roles.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Role', 'order' => 10,
            'parent' => 'ui.access_control.roles', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Create a role.',
            'implies' => ['admin.role.create'],
        ],
        'ui.access_control.roles.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Role', 'order' => 20,
            'parent' => 'ui.access_control.roles', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Update a role.',
            'implies' => ['admin.role.update'],
        ],
        'ui.access_control.roles.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Role', 'order' => 30,
            'parent' => 'ui.access_control.roles', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete a role.',
            'implies' => ['admin.role.delete'],
        ],
        /*
         * Company & Unit — the tenant master data.
         *
         * CRITICAL throughout, including the page itself, which is a higher
         * sensitivity than Users or Roles carry. That is deliberate: a role
         * governs what someone may do, and a company governs which records
         * exist for them at all. Renaming a company code moves every account
         * that carries it, so this page reaches further than either.
         *
         * The `api` mappings are the real method+URI pairs from routes/api.php.
         * RegistryApiContractTest asserts each one resolves, is protected, and
         * enforces a code this node implies — the API Permissions tab once
         * listed nine endpoints that did not exist.
         */
        'ui.access_control.company_units' => [
            'type' => self::TYPE_PAGE, 'label' => 'Company & Unit', 'order' => 25,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/company-units',
            'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Manage companies and the units that belong to them.',
            'implies' => ['admin.company.read'],
            'api' => [['GET', '/api/v1/admin/companies']],
        ],
        'ui.access_control.company_units.companies' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Companies', 'order' => 10,
            'parent' => 'ui.access_control.company_units', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'View the company master list.',
            'implies' => ['admin.company.read'],
            'api' => [['GET', '/api/v1/admin/companies']],
        ],
        'ui.access_control.company_units.companies.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Company', 'order' => 10,
            'parent' => 'ui.access_control.company_units.companies', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Create a company. The code becomes a tenant key.',
            'implies' => ['admin.company.create'],
            'api' => [['POST', '/api/v1/admin/companies']],
        ],
        'ui.access_control.company_units.companies.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Company', 'order' => 20,
            'parent' => 'ui.access_control.company_units.companies', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Rename a company. The code is locked once anything depends on it.',
            'implies' => ['admin.company.update'],
            'api' => [['PUT', '/api/v1/admin/companies/{id}']],
        ],
        'ui.access_control.company_units.companies.status' => [
            'type' => self::TYPE_ACTION, 'label' => 'Activate / Deactivate Company', 'order' => 30,
            'parent' => 'ui.access_control.company_units.companies', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Withdraw a company from new assignments, keeping its history.',
            'implies' => ['admin.company.status'],
            'api' => [['PATCH', '/api/v1/admin/companies/{id}/status']],
        ],
        'ui.access_control.company_units.companies.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Company', 'order' => 40,
            'parent' => 'ui.access_control.company_units.companies', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete a company. Refused while any user or unit depends on it.',
            'implies' => ['admin.company.delete'],
            'api' => [['DELETE', '/api/v1/admin/companies/{id}']],
        ],
        'ui.access_control.company_units.units' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Units', 'order' => 20,
            'parent' => 'ui.access_control.company_units', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'View the units belonging to each company.',
            'implies' => ['admin.unit.read'],
            'api' => [['GET', '/api/v1/admin/units'], ['GET', '/api/v1/admin/units/legacy']],
        ],
        'ui.access_control.company_units.units.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Unit', 'order' => 10,
            'parent' => 'ui.access_control.company_units.units', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Create a unit under a company, or adopt a legacy unit name into one.',
            'implies' => ['admin.unit.create'],
            'api' => [['POST', '/api/v1/admin/units'], ['POST', '/api/v1/admin/units/legacy/adopt']],
        ],
        'ui.access_control.company_units.units.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Unit', 'order' => 20,
            'parent' => 'ui.access_control.company_units.units', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Rename a unit. Its company is locked once users are assigned.',
            'implies' => ['admin.unit.update'],
            'api' => [['PUT', '/api/v1/admin/units/{id}']],
        ],
        'ui.access_control.company_units.units.status' => [
            'type' => self::TYPE_ACTION, 'label' => 'Activate / Deactivate Unit', 'order' => 30,
            'parent' => 'ui.access_control.company_units.units', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Withdraw a unit from new assignments, keeping its history.',
            'implies' => ['admin.unit.status'],
            'api' => [['PATCH', '/api/v1/admin/units/{id}/status']],
        ],
        'ui.access_control.company_units.units.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Unit', 'order' => 40,
            'parent' => 'ui.access_control.company_units.units', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete a unit. Refused while any user is assigned to it.',
            'implies' => ['admin.unit.delete'],
            'api' => [['DELETE', '/api/v1/admin/units/{id}']],
        ],
        'ui.access_control.permission_matrix' => [
            'type' => self::TYPE_PAGE, 'label' => 'Permission Matrix', 'order' => 30,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/permission-matrix',
            'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Open the permission matrix.',
            'implies' => ['admin.role.read'],
        ],
        'ui.access_control.permission_matrix.edit' => [
            'type' => self::TYPE_ACTION, 'label' => 'Edit Permissions', 'order' => 10,
            'parent' => 'ui.access_control.permission_matrix', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Change what a role grants.',
            'implies' => ['admin.role.update'],
        ],
        'ui.access_control.permission_matrix.clone' => [
            'type' => self::TYPE_ACTION, 'label' => 'Clone Role', 'order' => 20,
            'parent' => 'ui.access_control.permission_matrix', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Clone a role and its permission configuration.',
            'implies' => ['admin.role.clone'],
        ],
        'ui.access_control.permission_matrix.simulate' => [
            'type' => self::TYPE_ACTION, 'label' => 'Simulate', 'order' => 30,
            'parent' => 'ui.access_control.permission_matrix', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Run an authorization decision for another user.',
            'implies' => ['admin.authorization.simulate'],
        ],
        'ui.access_control.permission_matrix.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export', 'order' => 40,
            'parent' => 'ui.access_control.permission_matrix', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Export the permission configuration report.',
            'implies' => ['admin.authorization.audit.export'],
        ],
        'ui.access_control.permission_matrix.audit' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Change History', 'order' => 50,
            'parent' => 'ui.access_control.permission_matrix', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Read the permission change history.',
            'implies' => ['admin.authorization.audit.read'],
        ],
        'ui.access_control.policies' => [
            'type' => self::TYPE_PAGE, 'label' => 'Policies', 'order' => 40,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/policies',
            'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Open policy management.',
            'implies' => ['admin.policy.read'],
        ],
        'ui.access_control.policies.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Policy', 'order' => 10,
            'parent' => 'ui.access_control.policies', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Create an authorization policy.',
            'implies' => ['admin.policy.create'],
        ],
        'ui.access_control.policies.publish' => [
            'type' => self::TYPE_ACTION, 'label' => 'Publish Policy', 'order' => 20,
            'parent' => 'ui.access_control.policies', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Publish a policy version.',
            'implies' => ['admin.policy.publish'],
        ],
        'ui.access_control.policies.rollback' => [
            'type' => self::TYPE_ACTION, 'label' => 'Rollback Policy', 'order' => 30,
            'parent' => 'ui.access_control.policies', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Roll a policy back to an earlier version.',
            'implies' => ['admin.policy.rollback'],
        ],
        'ui.access_control.access_requests' => [
            'type' => self::TYPE_PAGE, 'label' => 'Access Requests', 'order' => 50,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/access-requests',
            'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Open access request review.',
            'implies' => ['admin.access_request.read'],
        ],
        'ui.access_control.access_requests.approve' => [
            'type' => self::TYPE_ACTION, 'label' => 'Approve Request', 'order' => 10,
            'parent' => 'ui.access_control.access_requests', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Approve an access request.',
            'implies' => ['admin.access_request.approve'],
        ],
        'ui.access_control.access_requests.revoke' => [
            'type' => self::TYPE_ACTION, 'label' => 'Revoke Request', 'order' => 20,
            'parent' => 'ui.access_control.access_requests', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Revoke previously granted access.',
            'implies' => ['admin.access_request.revoke'],
        ],
        'ui.access_control.delegations' => [
            'type' => self::TYPE_PAGE, 'label' => 'Delegations', 'order' => 60,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/delegations',
            'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Open delegation management.',
            'implies' => ['admin.delegation.manage'],
        ],
        'ui.access_control.emergency_access' => [
            'type' => self::TYPE_PAGE, 'label' => 'Emergency Access', 'order' => 70,
            'parent' => 'ui.access_control', 'route' => '/admin/access-control/emergency-access',
            'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Open emergency access review.',
            'implies' => ['admin.emergency_access.approve'],
        ],

        /* ------------------------------------------------------------ profile */

        'ui.profile' => [
            'type' => self::TYPE_MODULE, 'label' => 'Profile', 'order' => 100,
            'parent' => null, 'route' => '/admin/profile',
            'description' => 'Own profile page.',
            'implies' => ['hr.profile.read'],
            'scopes' => [self::SCOPE_OWN],
        ],
        'ui.profile.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Profile', 'order' => 10,
            'parent' => 'ui.profile',
            'description' => 'Update own profile details.',
            'implies' => ['hr.profile.update'],
            'scopes' => [self::SCOPE_OWN],
        ],

        /* -------------------------------------------------------- organization */

        /*
         * DOMAIN 02 — Enterprise & Organization Management.
         *
         * The workspace's pages read the org.master/org.legal_entity/org.location/
         * org.calendar codes, which the `permission:` middleware enforces and the
         * permission routes carry. This family is the Permission Matrix surface
         * over those codes. Writes are CRITICAL for the same reason a company edit
         * is: locations and legal entities are tenant master data that reach every
         * account inside the company.
         */
        'ui.organization' => [
            'type' => self::TYPE_MODULE, 'label' => 'Organization', 'order' => 15,
            'parent' => null, 'route' => '/admin/organization/master',
            'description' => 'Enterprise and organization management workspace.',
            'implies' => ['org.master.read'],
        ],
        'ui.organization.master' => [
            'type' => self::TYPE_PAGE, 'label' => 'Enterprise Master', 'order' => 10,
            'parent' => 'ui.organization', 'route' => '/admin/organization/master',
            'description' => 'Read the enterprise attributes of each company.',
            'implies' => ['org.master.read'],
            'api' => [['GET', '/api/v1/admin/organization/enterprise']],
        ],
        'ui.organization.master.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Enterprise Master', 'order' => 20,
            'parent' => 'ui.organization.master', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Edit the statutory details of a company.',
            'implies' => ['org.master.update'],
            'api' => [['PATCH', '/api/v1/admin/organization/enterprise/{id}']],
        ],
        'ui.organization.legal_entities' => [
            'type' => self::TYPE_PAGE, 'label' => 'Legal Entities', 'order' => 20,
            'parent' => 'ui.organization', 'route' => '/admin/organization/legal-entities',
            'description' => 'Read the legal entities of a company.',
            'implies' => ['org.legal_entity.read'],
            'api' => [['GET', '/api/v1/admin/organization/legal-entities']],
        ],
        'ui.organization.legal_entities.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Legal Entity', 'order' => 10,
            'parent' => 'ui.organization.legal_entities', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Create a legal entity under a company.',
            'implies' => ['org.legal_entity.create'],
            'api' => [['POST', '/api/v1/admin/organization/legal-entities']],
        ],
        'ui.organization.legal_entities.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Legal Entity', 'order' => 20,
            'parent' => 'ui.organization.legal_entities', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Edit a legal entity. Its company is locked once set.',
            'implies' => ['org.legal_entity.update'],
            'api' => [['PUT', '/api/v1/admin/organization/legal-entities/{id}']],
        ],
        'ui.organization.legal_entities.status' => [
            'type' => self::TYPE_ACTION, 'label' => 'Activate / Deactivate Legal Entity', 'order' => 30,
            'parent' => 'ui.organization.legal_entities', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Withdraw a legal entity from use, keeping its history.',
            'implies' => ['org.legal_entity.status'],
            'api' => [['PATCH', '/api/v1/admin/organization/legal-entities/{id}/status']],
        ],
        'ui.organization.legal_entities.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Legal Entity', 'order' => 40,
            'parent' => 'ui.organization.legal_entities', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete a legal entity. Refused while it is primary.',
            'implies' => ['org.legal_entity.delete'],
            'api' => [['DELETE', '/api/v1/admin/organization/legal-entities/{id}']],
        ],
        'ui.organization.locations' => [
            'type' => self::TYPE_PAGE, 'label' => 'Locations', 'order' => 30,
            'parent' => 'ui.organization', 'route' => '/admin/organization/locations',
            'description' => 'Read the business-structure locations of a company.',
            'implies' => ['org.location.read'],
            'api' => [['GET', '/api/v1/admin/organization/locations']],
        ],
        'ui.organization.locations.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Location', 'order' => 10,
            'parent' => 'ui.organization.locations', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Create a location under a company.',
            'implies' => ['org.location.create'],
            'api' => [['POST', '/api/v1/admin/organization/locations']],
        ],
        'ui.organization.locations.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Location', 'order' => 20,
            'parent' => 'ui.organization.locations', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Edit a location or reassign its members.',
            'implies' => ['org.location.update'],
            'api' => [
                ['PUT', '/api/v1/admin/organization/locations/{id}'],
                ['POST', '/api/v1/admin/organization/locations/{id}/members'],
                ['DELETE', '/api/v1/admin/organization/locations/{id}/members/{userId}'],
            ],
        ],
        'ui.organization.locations.status' => [
            'type' => self::TYPE_ACTION, 'label' => 'Activate / Deactivate Location', 'order' => 30,
            'parent' => 'ui.organization.locations', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Withdraw a location from use, keeping its history.',
            'implies' => ['org.location.status'],
            'api' => [['PATCH', '/api/v1/admin/organization/locations/{id}/status']],
        ],
        'ui.organization.locations.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Location', 'order' => 40,
            'parent' => 'ui.organization.locations', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete a location. Refused while it has children or members.',
            'implies' => ['org.location.delete'],
            'api' => [['DELETE', '/api/v1/admin/organization/locations/{id}']],
        ],
        'ui.organization.calendars' => [
            'type' => self::TYPE_PAGE, 'label' => 'Calendars', 'order' => 40,
            'parent' => 'ui.organization', 'route' => '/admin/organization/calendars',
            'description' => 'Read company and unit calendars.',
            'implies' => ['org.calendar.read'],
            'api' => [['GET', '/api/v1/admin/organization/calendars']],
        ],
        'ui.organization.calendars.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Calendar', 'order' => 10,
            'parent' => 'ui.organization.calendars', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Create a company or unit calendar.',
            'implies' => ['org.calendar.create'],
            'api' => [['POST', '/api/v1/admin/organization/calendars']],
        ],
        'ui.organization.calendars.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Calendar', 'order' => 20,
            'parent' => 'ui.organization.calendars', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Edit a calendar or its dated holidays.',
            'implies' => ['org.calendar.update'],
            'api' => [
                ['PUT', '/api/v1/admin/organization/calendars/{id}'],
                ['POST', '/api/v1/admin/organization/calendars/{id}/holidays'],
            ],
        ],
        'ui.organization.calendars.status' => [
            'type' => self::TYPE_ACTION, 'label' => 'Activate / Deactivate Calendar', 'order' => 30,
            'parent' => 'ui.organization.calendars', 'sensitivity' => self::SENSITIVITY_PRIVILEGED,
            'description' => 'Withdraw a calendar from use, keeping its history.',
            'implies' => ['org.calendar.status'],
            'api' => [['PATCH', '/api/v1/admin/organization/calendars/{id}/status']],
        ],
        'ui.organization.calendars.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Calendar', 'order' => 40,
            'parent' => 'ui.organization.calendars', 'sensitivity' => self::SENSITIVITY_CRITICAL,
            'description' => 'Delete a calendar. Refused while it has holidays.',
            'implies' => ['org.calendar.delete'],
            'api' => [
                ['DELETE', '/api/v1/admin/organization/calendars/{id}'],
                ['DELETE', '/api/v1/admin/organization/calendars/{id}/holidays/{holidayId}'],
            ],
        ],
    ];


    /**
     * Every node with its derived fields filled in.
     *
     * `permission` is the node's own canonical code, which is the array key for
     * assignable nodes and null for grouping rows. Deriving it here rather than
     * repeating the key inside every entry keeps the table above readable and
     * makes a typo between key and code impossible.
     */
    public static function all(): array
    {
        if (self::$normalised !== null) {
            return self::$normalised;
        }

        $out = [];

        foreach (self::NODES as $key => $node) {
            $assignable = ($node['assignable'] ?? true) !== false;

            $out[$key] = [
                'key' => $key,
                'code' => $key,
                'permission' => $assignable ? $key : null,
                'label' => $node['label'],
                'description' => $node['description'] ?? null,
                'type' => $node['type'],
                'parent' => $node['parent'] ?? null,
                'order' => $node['order'] ?? 0,
                'route' => $node['route'] ?? null,
                'sensitivity' => $node['sensitivity'] ?? self::SENSITIVITY_NORMAL,
                'sensitive' => ($node['sensitivity'] ?? self::SENSITIVITY_NORMAL) !== self::SENSITIVITY_NORMAL,
                'implies' => array_values($node['implies'] ?? []),
                'api' => array_values($node['api'] ?? []),
                'scopes' => array_values($node['scopes'] ?? []),
                'legacyAliases' => array_values($node['legacyAliases'] ?? []),
                'deprecated' => (bool) ($node['deprecated'] ?? false),
                'system' => (bool) ($node['system'] ?? false),
                'assignable' => $assignable,
            ];
        }

        return self::$normalised = $out;
    }

    public static function node(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }

    public static function has(string $key): bool
    {
        return isset(self::all()[$key]);
    }

    /** Ancestors nearest-first. */
    public static function ancestorsOf(string $key): array
    {
        $nodes = self::all();
        $chain = [];
        $seen = [];
        $current = $nodes[$key]['parent'] ?? null;

        while ($current !== null && isset($nodes[$current]) && ! isset($seen[$current])) {
            $seen[$current] = true;
            $chain[] = $current;
            $current = $nodes[$current]['parent'] ?? null;
        }

        return $chain;
    }

    /**
     * Permission codes that must all hold for this node to be effective:
     * the node's own code plus every ancestor's code.
     */
    public static function requiredCodesFor(string $key): array
    {
        $nodes = self::all();

        if (! isset($nodes[$key])) {
            return [];
        }

        $codes = [];

        if (($own = $nodes[$key]['permission']) !== null) {
            $codes[] = $own;
        }

        foreach (self::ancestorsOf($key) as $ancestor) {
            if (($code = $nodes[$ancestor]['permission']) !== null) {
                $codes[] = $code;
            }
        }

        return array_values(array_unique($codes));
    }

    public static function childrenOf(?string $key): array
    {
        if (self::$childIndex === null) {
            $index = [];

            foreach (self::all() as $childKey => $node) {
                $index[$node['parent'] ?? ''][$childKey] = $node;
            }

            foreach ($index as $parent => $children) {
                uasort($children, fn ($a, $b) => $a['order'] <=> $b['order']);
                $index[$parent] = $children;
            }

            self::$childIndex = $index;
        }

        return self::$childIndex[$key ?? ''] ?? [];
    }

    /** Descendants of a node, excluding grouping rows with no permission. */
    public static function assignableDescendantsOf(string $key): array
    {
        $out = [];

        foreach (self::childrenOf($key) as $childKey => $child) {
            if ($child['permission'] !== null) {
                $out[] = $childKey;
            }
            $out = array_merge($out, self::assignableDescendantsOf($childKey));
        }

        return $out;
    }

    public static function nodesForPermission(string $permissionCode): array
    {
        return array_keys(array_filter(
            self::all(),
            fn ($node) => $node['permission'] === $permissionCode
        ));
    }

    /** Every canonical code the registry can render. */
    public static function permissionCodes(): array
    {
        $codes = [];

        foreach (self::all() as $node) {
            if ($node['permission'] !== null) {
                $codes[$node['permission']] = true;
            }
        }

        return array_keys($codes);
    }

    /** Business permission codes a canonical grant projects onto. */
    public static function impliedCodes(string $key): array
    {
        return self::node($key)['implies'] ?? [];
    }

    /** Canonical nodes that project onto a given business permission code. */
    public static function nodesImplying(string $businessCode): array
    {
        return array_keys(array_filter(
            self::all(),
            fn ($node) => in_array($businessCode, $node['implies'], true)
        ));
    }

    /** Every business permission code referenced by the registry. */
    public static function impliedPermissionCodes(): array
    {
        $codes = [];

        foreach (self::all() as $node) {
            foreach ($node['implies'] as $code) {
                $codes[$code] = true;
            }
        }

        return array_keys($codes);
    }

    /** The module node a key belongs to. */
    public static function moduleOf(string $key): ?string
    {
        $chain = self::ancestorsOf($key);
        $top = $chain === [] ? $key : end($chain);

        return self::has($top) ? $top : null;
    }

    /** The nearest page ancestor, or the node itself when it is a page. */
    public static function pageOf(string $key): ?string
    {
        foreach (array_merge([$key], self::ancestorsOf($key)) as $candidate) {
            if ((self::node($candidate)['type'] ?? null) === self::TYPE_PAGE) {
                return $candidate;
            }
        }

        return null;
    }

    /** Registry nodes that declare a frontend route. */
    public static function routes(): array
    {
        $out = [];

        foreach (self::all() as $key => $node) {
            if ($node['route'] !== null) {
                $out[$node['route']] = $key;
            }
        }

        return $out;
    }

    public static function tree(?string $parent = null): array
    {
        $out = [];

        foreach (self::childrenOf($parent) as $key => $node) {
            $out[] = array_merge($node, [
                'permissionKey' => $node['permission'],
                'displayOrder' => $node['order'],
                'children' => self::tree($key),
            ]);
        }

        return $out;
    }
}
