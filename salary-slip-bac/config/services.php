<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Shared secret in the candidate-intake webhook URL — see
    // PublicCandidateIntakeController and .env's CANDIDATE_INTAKE_TOKEN.
    'candidate_intake' => [
        'token' => env('CANDIDATE_INTAKE_TOKEN'),
    ],

    'fast2sms' => [
        'key' => env('FAST2SMS_API_KEY'),
        'route' => env('FAST2SMS_ROUTE', 'otp'),
    ],

    // Google Calendar/Meet integration for interview scheduling
    // (GoogleMeetService). Uses a service account with domain-wide
    // delegation — see docs/google-meet-setup.md for how to provision one.
    // `impersonate` is the Workspace mailbox the service account acts as;
    // events are created on that calendar with real participants invited as
    // guests, since a bare service account has no Calendar of its own.
    'google' => [
        'service_account_path' => env('GOOGLE_SERVICE_ACCOUNT_PATH'),
        'impersonate' => env('GOOGLE_CALENDAR_IMPERSONATE_EMAIL'),
    ],

    // Base URL of the React frontend, used to build candidate-facing links
    // in hiring emails (e.g. the public quiz link). APP_URL above is this
    // Laravel API's own address, not the SPA's — they're different origins.
    // Left null-safe on purpose: if unset, emails still send with the link
    // omitted rather than pointing somewhere wrong.
    'frontend_url' => env('FRONTEND_URL'),

];
