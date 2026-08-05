<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class NavigationRegistry
{
    public const ACTION_ORDER = [
        'access_page' => 5,
        'list' => 10,
        'view_details' => 20,
        'create' => 30,
        'update' => 40,
        'delete' => 50,
        'execute' => 60,
        'approve' => 70,
        'reject' => 80,
        'assign' => 90,
        'import' => 100,
        'export' => 110,
        'print' => 120,
        'configure' => 130,
        'manage' => 140,
    ];

    public const ACTION_LABEL = [
        'access_page' => 'Access Page',
        'list' => 'List',
        'view_details' => 'View Details',
        'create' => 'Create',
        'update' => 'Update',
        'delete' => 'Delete',
        'execute' => 'Execute',
        'approve' => 'Approve',
        'reject' => 'Reject',
        'assign' => 'Assign',
        'import' => 'Import',
        'export' => 'Export',
        'print' => 'Print',
        'configure' => 'Configure',
        'manage' => 'Manage',
    ];

    private const MODULES = [
        'attendance' => [
            'label' => 'Attendance',
            'order' => 40,
            'resources' => [
                'view_attendance' => [
                    'label' => 'View Attendance',
                    'order' => 10,
                    'technicalResourceCode' => 'hr.attendance',
                    'routePath' => '/admin/attendance',
                    'actions' => [
                        'access_page' => 'ui.admin.attendance.view',
                        'list' => 'hr.attendance.read',
                        'update' => 'hr.attendance.update',
                        'import' => 'hr.attendance.import',
                    ],
                ],
                'shift' => [
                    'label' => 'Shift',
                    'order' => 20,
                    'technicalResourceCode' => 'hr.shift',
                    'routePath' => '/admin/attendance/shift',
                    'actions' => [
                        'list' => 'hr.shift.read',
                        'create' => 'hr.shift.create',
                        'update' => 'hr.shift.update',
                        'delete' => 'hr.shift.delete',
                        'assign' => 'hr.shift.assign',
                    ],
                ],
            ],
        ],
        'tds' => [
            'label' => 'TDS',
            'order' => 60,
            'resources' => [
                'tds_calculation' => [
                    'label' => 'TDS Calculation',
                    'order' => 10,
                    'technicalResourceCode' => 'ui.admin.tds',
                    'routePath' => '/admin/tds/calculation',
                    'actions' => [
                        'access_page' => 'ui.admin.tds.view',
                    ],
                ],
                'form16' => [
                    'label' => 'Form 16',
                    'order' => 20,
                    'technicalResourceCode' => 'ui.admin.form16',
                    'routePath' => '/admin/form16',
                    'actions' => [
                        'access_page' => 'ui.admin.form16.view',
                        'list' => 'payroll.form16.read',
                    ],
                ],
            ],
        ],
    ];

    public static function modules(): array
    {
        $modules = self::MODULES;

        uasort($modules, fn ($a, $b) => $a['order'] <=> $b['order']);

        return $modules;
    }

    public static function tree(): array
    {
        $out = [];

        foreach (self::modules() as $moduleKey => $module) {
            $resources = $module['resources'];
            uasort($resources, fn ($a, $b) => $a['order'] <=> $b['order']);

            $children = [];

            foreach ($resources as $resourceKey => $resource) {
                $actions = [];

                foreach ($resource['actions'] as $actionKey => $permissionCode) {
                    $actions[] = [
                        'actionKey' => $actionKey,
                        'actionLabel' => self::ACTION_LABEL[$actionKey] ?? ucwords(str_replace('_', ' ', $actionKey)),
                        'displayOrder' => self::ACTION_ORDER[$actionKey] ?? 500,
                        'permissionKey' => $permissionCode,
                        'applicable' => true,
                    ];
                }

                usort($actions, fn ($a, $b) => $a['displayOrder'] <=> $b['displayOrder']);

                $children[] = [
                    'resourceKey' => $resourceKey,
                    'resourceLabel' => $resource['label'],
                    'technicalResourceCode' => $resource['technicalResourceCode'],
                    'routePath' => $resource['routePath'],
                    'displayOrder' => $resource['order'],
                    'actions' => $actions,
                ];
            }

            $out[] = [
                'navigationModuleKey' => $moduleKey,
                'navigationModuleLabel' => $module['label'],
                'displayOrder' => $module['order'],
                'resources' => $children,
            ];
        }

        return $out;
    }

    public static function permissionCodes(): array
    {
        $codes = [];

        foreach (self::MODULES as $module) {
            foreach ($module['resources'] as $resource) {
                foreach ($resource['actions'] as $permissionCode) {
                    $codes[] = $permissionCode;
                }
            }
        }

        return array_values(array_unique($codes));
    }

    public static function isApplicable(string $permissionCode): bool
    {
        return in_array($permissionCode, self::permissionCodes(), true);
    }

    public static function locate(string $permissionCode): ?array
    {
        foreach (self::MODULES as $moduleKey => $module) {
            foreach ($module['resources'] as $resourceKey => $resource) {
                foreach ($resource['actions'] as $actionKey => $code) {
                    if ($code === $permissionCode) {
                        return [
                            'navigationModuleKey' => $moduleKey,
                            'navigationModuleLabel' => $module['label'],
                            'resourceKey' => $resourceKey,
                            'resourceLabel' => $resource['label'],
                            'routePath' => $resource['routePath'],
                            'actionKey' => $actionKey,
                            'actionLabel' => self::ACTION_LABEL[$actionKey] ?? $actionKey,
                            'permissionKey' => $permissionCode,
                        ];
                    }
                }
            }
        }

        return null;
    }

    public static function auditLabel(string $permissionCode): string
    {
        $found = self::locate($permissionCode);

        if ($found === null) {
            return $permissionCode;
        }

        return sprintf(
            '%s → %s → %s',
            $found['navigationModuleLabel'],
            $found['resourceLabel'],
            $found['actionLabel']
        );
    }

    public static function unknownPermissionCodes(): array
    {
        $known = DB::table('permissions')->pluck('code')->map('strval')->all();

        return array_values(array_diff(self::permissionCodes(), $known));
    }

    public static function duplicateLabelsWithin(string $moduleKey): array
    {
        $module = self::MODULES[$moduleKey] ?? null;

        if ($module === null) {
            return [];
        }

        $duplicates = [];

        foreach ($module['resources'] as $resourceKey => $resource) {
            $labels = [];
            foreach (array_keys($resource['actions']) as $actionKey) {
                $label = self::ACTION_LABEL[$actionKey] ?? $actionKey;
                $labels[$label] = ($labels[$label] ?? 0) + 1;
            }
            foreach ($labels as $label => $count) {
                if ($count > 1) {
                    $duplicates[] = $resourceKey . ':' . $label;
                }
            }
        }

        return $duplicates;
    }
}
