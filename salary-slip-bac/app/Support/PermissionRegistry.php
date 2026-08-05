<?php

namespace App\Support;

class PermissionRegistry
{
    public const TYPE_MODULE = 'module';
    public const TYPE_PAGE = 'page';
    public const TYPE_FEATURE = 'feature';
    public const TYPE_ACTION = 'action';
    public const TYPE_COLUMN = 'column';
    public const TYPE_CARD = 'card';
    public const TYPE_FILTER = 'filter';

    /**
     * key => [type, label, parent, permission, order]
     *
     * `permission` is the stable permission code enforced by middleware. A node
     * with a null permission is a grouping row only: it carries no database
     * permission and can never be granted, but it still participates in the
     * parent chain for display.
     */
    private const NODES = [
        'employees' => [
            'type' => self::TYPE_MODULE, 'label' => 'Employees',
            'parent' => null, 'permission' => 'ui.admin.employees.view', 'order' => 20,
        ],

        'employees.master' => [
            'type' => self::TYPE_PAGE, 'label' => 'Employee Master',
            'parent' => 'employees', 'permission' => 'hr.employee.read', 'order' => 10,
            'route' => '/admin/employees/add',
        ],
        'employees.master.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create Employee',
            'parent' => 'employees.master', 'permission' => 'hr.employee.create', 'order' => 20,
        ],
        'employees.master.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update Employee',
            'parent' => 'employees.master', 'permission' => 'hr.employee.update', 'order' => 30,
        ],
        'employees.master.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete Employee',
            'parent' => 'employees.master', 'permission' => 'hr.employee.delete', 'order' => 40,
        ],
        'employees.master.import' => [
            'type' => self::TYPE_ACTION, 'label' => 'Import',
            'parent' => 'employees.master', 'permission' => 'hr.employee.import', 'order' => 50,
        ],
        'employees.master.export' => [
            'type' => self::TYPE_ACTION, 'label' => 'Export',
            'parent' => 'employees.master', 'permission' => 'hr.employee.export', 'order' => 60,
        ],
        'employees.master.print' => [
            'type' => self::TYPE_ACTION, 'label' => 'Print',
            'parent' => 'employees.master', 'permission' => 'hr.employee.print', 'order' => 70,
        ],

        'employees.master.columns' => [
            'type' => self::TYPE_FEATURE, 'label' => 'Table Columns',
            'parent' => 'employees.master', 'permission' => null, 'order' => 80,
        ],
        'employees.master.columns.salary' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Salary',
            'parent' => 'employees.master.columns', 'permission' => 'hr.employee.salary.read',
            'order' => 10, 'sensitive' => true,
        ],
        'employees.master.columns.bank_account' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Bank Account',
            'parent' => 'employees.master.columns', 'permission' => 'hr.employee.bank_account.reveal',
            'order' => 20, 'sensitive' => true,
        ],
        'employees.master.columns.aadhaar' => [
            'type' => self::TYPE_COLUMN, 'label' => 'Aadhaar',
            'parent' => 'employees.master.columns', 'permission' => 'hr.employee.aadhaar.reveal',
            'order' => 30, 'sensitive' => true,
        ],

        'attendance' => [
            'type' => self::TYPE_MODULE, 'label' => 'Attendance',
            'parent' => null, 'permission' => 'ui.admin.attendance.view', 'order' => 40,
        ],
        'attendance.view_attendance' => [
            'type' => self::TYPE_PAGE, 'label' => 'View Attendance',
            'parent' => 'attendance', 'permission' => 'hr.attendance.read', 'order' => 10,
            'route' => '/admin/attendance',
        ],
        'attendance.view_attendance.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update',
            'parent' => 'attendance.view_attendance', 'permission' => 'hr.attendance.update', 'order' => 20,
        ],
        'attendance.view_attendance.import' => [
            'type' => self::TYPE_ACTION, 'label' => 'Import',
            'parent' => 'attendance.view_attendance', 'permission' => 'hr.attendance.import', 'order' => 30,
        ],
        'attendance.shift' => [
            'type' => self::TYPE_PAGE, 'label' => 'Shift',
            'parent' => 'attendance', 'permission' => 'hr.shift.read', 'order' => 20,
            'route' => '/admin/attendance/shift',
        ],
        'attendance.shift.create' => [
            'type' => self::TYPE_ACTION, 'label' => 'Create',
            'parent' => 'attendance.shift', 'permission' => 'hr.shift.create', 'order' => 10,
        ],
        'attendance.shift.update' => [
            'type' => self::TYPE_ACTION, 'label' => 'Update',
            'parent' => 'attendance.shift', 'permission' => 'hr.shift.update', 'order' => 20,
        ],
        'attendance.shift.delete' => [
            'type' => self::TYPE_ACTION, 'label' => 'Delete',
            'parent' => 'attendance.shift', 'permission' => 'hr.shift.delete', 'order' => 30,
        ],
        'attendance.shift.assign' => [
            'type' => self::TYPE_ACTION, 'label' => 'Assign',
            'parent' => 'attendance.shift', 'permission' => 'hr.shift.assign', 'order' => 40,
        ],
    ];

    public static function all(): array
    {
        return self::NODES;
    }

    public static function node(string $key): ?array
    {
        return self::NODES[$key] ?? null;
    }

    public static function has(string $key): bool
    {
        return isset(self::NODES[$key]);
    }

    /** Ancestors nearest-first. */
    public static function ancestorsOf(string $key): array
    {
        $chain = [];
        $seen = [];
        $current = self::NODES[$key]['parent'] ?? null;

        while ($current !== null && isset(self::NODES[$current]) && ! isset($seen[$current])) {
            $seen[$current] = true;
            $chain[] = $current;
            $current = self::NODES[$current]['parent'] ?? null;
        }

        return $chain;
    }

    /**
     * Permission codes that must all hold for this node to be effective:
     * the node's own code plus every ancestor's code.
     */
    public static function requiredCodesFor(string $key): array
    {
        if (! isset(self::NODES[$key])) {
            return [];
        }

        $codes = [];

        if (($own = self::NODES[$key]['permission'] ?? null) !== null) {
            $codes[] = $own;
        }

        foreach (self::ancestorsOf($key) as $ancestor) {
            if (($code = self::NODES[$ancestor]['permission'] ?? null) !== null) {
                $codes[] = $code;
            }
        }

        return array_values(array_unique($codes));
    }

    public static function childrenOf(?string $key): array
    {
        $children = array_filter(
            self::NODES,
            fn ($node) => ($node['parent'] ?? null) === $key
        );

        uasort($children, fn ($a, $b) => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));

        return $children;
    }

    /** Descendants of a node, excluding grouping rows with no permission. */
    public static function assignableDescendantsOf(string $key): array
    {
        $out = [];

        foreach (self::childrenOf($key) as $childKey => $child) {
            if (($child['permission'] ?? null) !== null) {
                $out[] = $childKey;
            }
            $out = array_merge($out, self::assignableDescendantsOf($childKey));
        }

        return $out;
    }

    public static function nodesForPermission(string $permissionCode): array
    {
        return array_keys(array_filter(
            self::NODES,
            fn ($node) => ($node['permission'] ?? null) === $permissionCode
        ));
    }

    /** Every permission code the tree can render, for legacy de-duplication. */
    public static function permissionCodes(): array
    {
        $codes = [];

        foreach (self::NODES as $node) {
            if (($code = $node['permission'] ?? null) !== null) {
                $codes[$code] = true;
            }
        }

        return array_keys($codes);
    }

    public static function tree(?string $parent = null): array
    {
        $out = [];

        foreach (self::childrenOf($parent) as $key => $node) {
            $out[] = [
                'key' => $key,
                'label' => $node['label'],
                'type' => $node['type'],
                'permissionKey' => $node['permission'] ?? null,
                'assignable' => ($node['permission'] ?? null) !== null,
                'sensitive' => (bool) ($node['sensitive'] ?? false),
                'route' => $node['route'] ?? null,
                'displayOrder' => $node['order'] ?? 0,
                'children' => self::tree($key),
            ];
        }

        return $out;
    }
}
