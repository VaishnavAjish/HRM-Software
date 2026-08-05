<?php

return [

    'enforcement' => [

        'default_mode' => 'shadow',

        'enforced_permissions' => array_values(array_filter(
            array_map('trim', explode(',', (string) env('AUTHZ_ENFORCED_PERMISSIONS', '')))
        )),

        'enforced_prefixes' => array_values(array_filter(
            array_map('trim', explode(',', (string) env('AUTHZ_ENFORCED_PREFIXES', '')))
        )),

        'always_enforced_prefixes' => [
            'admin.authorization.',
            'admin.policy.',
        ],

    ],

];
