<?php

return [
    // Attendance Engine Rebuild — Phase 0.
    //
    // Two same-employee raw punches this close together (in seconds) are
    // treated as one canonical scan plus a DUPLICATE, not two real events
    // (spec §3). Configurable, never hardcoded in the ingestor.
    'duplicate_window_seconds' => (int) env('ATTENDANCE_DUPLICATE_WINDOW_SECONDS', 30),

    // Company/branch timezone attendance is calculated in (spec §56). Every
    // punch_datetime is stored and reasoned about in this zone; the
    // per-company/branch override this eventually needs (multi-timezone
    // deployments) is a later phase — flagged here, not silently assumed.
    'timezone' => env('ATTENDANCE_TIMEZONE', 'Asia/Kolkata'),
];
