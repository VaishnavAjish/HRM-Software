<?php

return [

    'enforcement' => [

        'default_mode' => env('AUTHZ_MODE', 'enforced'),

        'enforced_permissions' => array_values(array_filter(
            array_map('trim', explode(',', (string) env('AUTHZ_ENFORCED_PERMISSIONS', '')))
        )),

        'enforced_prefixes' => array_values(array_filter(
            array_map('trim', explode(',', (string) env('AUTHZ_ENFORCED_PREFIXES', 'hr.,payroll.,recruitment.,document.,workflow.,self.,ui.')))
        )),

        'always_enforced_prefixes' => [
            'admin.authorization.',
            'admin.policy.',
        ],

    ],

];
