<?php

return [

    'enforcement' => [

        /*
         * Fail safe. The default is SHADOW and the default enforced set is EMPTY,
         * so a deployment that ships no AUTHZ_* variables — or one where the
         * variables are present but blank — enforces nothing beyond
         * always_enforced_prefixes. Global enforcement must be an explicit,
         * deliberate choice in the environment, never the accident of a missing
         * or cleared line: an earlier config defaulted the prefixes to every
         * business namespace, so deleting the (intentionally empty) env line
         * would have silently hard-enforced hr./payroll./… on production.
         *
         * To enforce, set AUTHZ_ENFORCED_PREFIXES (or AUTHZ_ENFORCED_PERMISSIONS)
         * explicitly and roll out prefix-by-prefix; only then set
         * AUTHZ_MODE=enforced. An explicit env value always overrides these
         * defaults.
         */
        'default_mode' => env('AUTHZ_MODE', 'shadow'),

        'enforced_permissions' => array_values(array_filter(
            array_map('trim', explode(',', (string) env('AUTHZ_ENFORCED_PERMISSIONS', '')))
        )),

        'enforced_prefixes' => array_values(array_filter(
            array_map('trim', explode(',', (string) env('AUTHZ_ENFORCED_PREFIXES', '')))
        )),

        // Always enforced regardless of mode or prefix configuration — the two
        // namespaces that can grant authority to grant authority.
        'always_enforced_prefixes' => [
            'admin.authorization.',
            'admin.policy.',
        ],

    ],

];
