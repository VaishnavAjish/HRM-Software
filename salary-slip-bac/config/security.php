<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Reveal hidden system accounts
    |--------------------------------------------------------------------------
    |
    | When false (the default), accounts flagged is_hidden are excluded from
    | every listing, lookup, dashboard count, export and search through the
    | centralized App\Support\HiddenAccounts helper. Set to true only for a
    | deliberate diagnostic session; it does not change what the account can
    | do, only whether it is visible to administration surfaces.
    |
    | The audit trail is never affected by this flag: a hidden account's
    | actions are always recorded with its real identifier server-side, so an
    | action on employee data can always be attributed. Hiding the account
    | removes it from management, not from accountability.
    |
    */

    'show_super_admin' => (bool) env('SHOW_SUPER_ADMIN', false),

    /*
    |--------------------------------------------------------------------------
    | Reveal the protected system role
    |--------------------------------------------------------------------------
    |
    | The role management surface treats the codes listed below as the single
    | protected SYSTEM_SUPER_ADMIN identity: it is excluded from every role
    | listing, selector and filter, and can never be edited, cloned, archived
    | or deleted through the API (App\Support\SystemRoles). Set the flag true
    | only for a deliberate diagnostic session; it changes visibility, not what
    | the role grants.
    |
    */

    'show_system_role' => (bool) env('SHOW_SYSTEM_ROLE', false),

    'system_role_codes' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('SYSTEM_ROLE_CODES', 'super_administrator'))
    ))),

];
