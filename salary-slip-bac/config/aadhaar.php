<?php

return [
    /*
     * Master switch for confidential (full-Aadhaar) Print and PDF export.
     *
     * Off by default. While it is off the endpoints return 503 and the client
     * hides the confidential options — but masked Print and masked PDF keep
     * working, and there is deliberately no fallback that would produce a
     * full-Aadhaar export through the unaudited client-side path.
     */
    'confidential_export_enabled' => env('CONFIDENTIAL_AADHAAR_EXPORT_ENABLED', false),

    /*
     * How long an issued export authorization stays usable.
     *
     * Short because it exists to bind one click to one export, not to be a
     * session. It is not a protection against a determined holder of the
     * exported file — once a PDF is downloaded or a page is printed, the copy
     * is outside this application entirely.
     */
    'export_token_ttl' => (int) env('AADHAAR_EXPORT_TOKEN_TTL_SECONDS', 60),
];
