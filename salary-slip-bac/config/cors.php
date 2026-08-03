<?php

$proxyHandlesCors = filter_var(
    env('CORS_HANDLED_BY_PROXY', env('APP_ENV') === 'production'),
    FILTER_VALIDATE_BOOL
);

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie', '*'],

    'allowed_methods' => ['*'],

    // niss.pro's edge proxy already emits the production CORS header. Emitting
    // a second wildcard from Laravel produces the invalid `*, *` value browsers
    // reject. Local/dev servers have no proxy, so Laravel remains the owner there.
    'allowed_origins' => $proxyHandlesCors ? [] : ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => false,

];
