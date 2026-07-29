<?php

return [
    // 'local' keeps the legacy public/uploads behaviour, 's3' stores documents
    // in S3 and serves them only through short-lived presigned URLs.
    'provider' => env('DOCUMENT_STORAGE_PROVIDER', 'local'),

    // Allows reads of legacy rows that still point at public/uploads while a
    // migration is in progress. Turn off once migration is verified.
    'legacy_read_enabled' => env('DOCUMENT_LEGACY_READ_ENABLED', true),

    's3' => [
        'bucket'            => env('AWS_S3_BUCKET'),
        'region'            => env('AWS_REGION', env('AWS_DEFAULT_REGION')),
        'endpoint'          => env('AWS_S3_ENDPOINT'),
        'path_style'        => env('AWS_S3_FORCE_PATH_STYLE', false),
        // AES256 (SSE-S3) or aws:kms (SSE-KMS)
        'encryption'        => env('AWS_S3_ENCRYPTION', 'AES256'),
        'kms_key_id'        => env('AWS_KMS_KEY_ID'),
        'storage_class'     => env('AWS_S3_STORAGE_CLASS', 'STANDARD'),
        // Path to a CA bundle for TLS verification. Needed on hosts where PHP
        // has no curl.cainfo/openssl.cafile configured (common on Windows) —
        // without it every AWS call dies with cURL error 60. Leave unset on
        // properly configured Linux hosts.
        'ca_bundle'         => env('AWS_CA_BUNDLE'),
        // Files at or above this size go through a multipart upload.
        'multipart_threshold' => (int) env('DOCUMENT_MULTIPART_THRESHOLD_BYTES', 8 * 1024 * 1024),
        'part_size'           => (int) env('DOCUMENT_MULTIPART_PART_SIZE_BYTES', 8 * 1024 * 1024),
        'concurrency'         => (int) env('DOCUMENT_UPLOAD_CONCURRENCY', 3),
    ],

    'view_url_ttl'     => (int) env('DOCUMENT_VIEW_URL_TTL_SECONDS', 300),
    'download_url_ttl' => (int) env('DOCUMENT_DOWNLOAD_URL_TTL_SECONDS', 300),

    'max_file_size' => (int) env('DOCUMENT_MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024),

    // SOFT_DELETE | ARCHIVE | PERMANENT — what DELETE actually does to the object.
    'archive_mode' => env('DOCUMENT_ARCHIVE_MODE', 'SOFT_DELETE'),

    'malware_scan_enabled' => env('DOCUMENT_MALWARE_SCAN_ENABLED', false),

    // Extensions that must never be stored, regardless of sniffed MIME type.
    'blocked_extensions' => [
        'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'phar', 'inc',
        'exe', 'dll', 'com', 'bat', 'cmd', 'scr', 'msi', 'ps1', 'sh', 'bash',
        'jar', 'apk', 'app', 'dmg', 'iso', 'so', 'vbs', 'wsf', 'hta',
        'js', 'mjs', 'html', 'htm', 'svg', 'xhtml',
    ],

    // Authoritative allowlist keyed by business document type. A type absent
    // here falls back to 'default'.
    'allowed_mime_types' => [
        'default'          => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        'PAN_CARD'         => ['application/pdf', 'image/jpeg', 'image/png'],
        'AADHAR_CARD'      => ['application/pdf', 'image/jpeg', 'image/png'],
        'BANK_PASSBOOK'    => ['application/pdf', 'image/jpeg', 'image/png'],
        'CANCELLED_CHEQUE' => ['application/pdf', 'image/jpeg', 'image/png'],
        'PHOTOGRAPH'       => ['image/jpeg', 'image/png', 'image/webp'],
        'SIGNATURE'        => ['image/jpeg', 'image/png', 'image/webp'],
        'RESUME'           => ['application/pdf'],
        'CV'               => ['application/pdf'],
        'FORM_16'          => ['application/pdf'],
        'ITR'              => ['application/pdf'],
    ],

    // Canonical extension per sniffed MIME type. The browser-supplied
    // extension is never trusted — this is what actually gets used.
    'mime_extension_map' => [
        'application/pdf' => 'pdf',
        'image/jpeg'      => 'jpg',
        'image/png'       => 'png',
        'image/webp'      => 'webp',
        'image/gif'       => 'gif',
    ],
];
