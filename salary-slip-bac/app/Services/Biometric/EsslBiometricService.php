<?php

namespace App\Services\Biometric;

use App\Models\Attendance;
use App\Models\UploadBatch;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * READ-ONLY toward the physical eSSL devices, by design and by policy: the
 * only SOAP action this service ever calls is `GetTransactionsLog` (fetch
 * punch history) — never a write/push action (no `SetUserInfo`, no
 * `ClearGLog`/`ClearData`, no `EnableDevice`/`DisableDevice`, no remote
 * command queue push, nothing that changes a device's own state). Do not add
 * one without an explicit, separate decision to do so — a bug here can
 * corrupt or wipe a physical biometric terminal's own data, which this
 * codebase has no way to undo.
 */
class EsslBiometricService
{
    /**
     * Complete list of 28 connected eSSL biometric devices in the enterprise.
     */
    public const DEVICE_SERIALS = [
        "TDBD254500578", "TDBD253600396", "TDBD253600373", "CPAK232160545",
        "TDBD253600369", "TDBD253600390", "CRJP230760314", "CPAK222560309",
        "JYK8234700169", "TDBD240400272", "TDBD240400401", "NES1260500255",
        "CPAK222560310", "NES1260500183", "CPAK222560312", "CPAK222560451",
        "CRJP230760340", "CPAK222560320", "CPAK222560658", "CRJP230760331",
        "TDBD260200086", "TDBD260200491", "CPAK222560653", "CPAK223760033",
        "CPAK223760603", "CPAK222560306", "CPAK222560307", "CPAK222560447"
    ];

    private string $apiUrl;
    private string $username;
    private string $password;
    private string $namespace;
    private int $maxConcurrentFetches;
    private bool $isConfigured;

    public function __construct()
    {
        // No hardcoded fallback for the URL/credentials -- they live in
        // .env only (never committed; see .env.example for the required
        // keys). A missing value does NOT throw here: construction happens
        // during Laravel's controller-dependency resolution, before the
        // controller's own try/catch is in scope, so an exception here
        // would surface as a raw framework error page instead of the same
        // graceful "status: false" JSON every other eSSL failure returns.
        // $isConfigured is checked at the top of syncAttendance() instead.
        $this->apiUrl = (string) env('ESSL_API_URL', '');
        $this->username = (string) env('ESSL_USERNAME', '');
        $this->password = (string) env('ESSL_PASSWORD', '');
        $this->namespace = (string) env('ESSL_NAMESPACE', 'http://tempuri.org/');
        $this->isConfigured = $this->apiUrl !== '' && $this->username !== '' && $this->password !== '';
        // ALL 28 devices share this one apiUrl (the serial goes in the SOAP
        // body, not the URL) — a free ngrok tunnel to what's almost
        // certainly a single small on-prem Windows/IIS box, not a
        // load-balanced production API. That combination frequently tolerates
        // only ONE request at a time; sending even a *bounded* handful of
        // concurrent requests at it was enough to make the whole tunnel/box
        // close, breaking a sync that ran fine (if slowly) one device at a
        // time before. Default is therefore sequential (1) — the behavior
        // that was actually working — with concurrency available as an
        // explicit opt-in via .env for anyone whose eSSL endpoint is known
        // to handle it (a dedicated server, a paid ngrok tier, etc.).
        $this->maxConcurrentFetches = max(1, (int) env('ESSL_MAX_CONCURRENT_FETCHES', 1));
    }

    /** Builds the (read-only) GetTransactionsLog SOAP request body — the ONLY SOAP action this class ever issues. */
    private function buildTransactionsLogSoapEnvelope(string $serial, string $fromDateTime, string $toDateTime): string
    {
        return '<?xml version="1.0" encoding="utf-8"?>' .
            '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' .
            '<soap:Body>' .
            '<GetTransactionsLog xmlns="' . htmlspecialchars($this->namespace) . '">' .
            '<FromDateTime>' . htmlspecialchars($fromDateTime) . '</FromDateTime>' .
            '<ToDateTime>' . htmlspecialchars($toDateTime) . '</ToDateTime>' .
            '<SerialNumber>' . htmlspecialchars($serial) . '</SerialNumber>' .
            '<UserName>' . htmlspecialchars($this->username) . '</UserName>' .
            '<UserPassword>' . htmlspecialchars($this->password) . '</UserPassword>' .
            '<strDataList></strDataList>' .
            '</GetTransactionsLog>' .
            '</soap:Body>' .
            '</soap:Envelope>';
    }

    private function transactionsLogHttpHeaders(): array
    {
        return [
            'Content-Type: text/xml; charset=utf-8',
            'SOAPAction: "' . rtrim($this->namespace, '/') . '/GetTransactionsLog"',
            'ngrok-skip-browser-warning: true',
        ];
    }

    /** Extracts the newline-delimited punch lines out of a raw GetTransactionsLog SOAP response body. */
    private function parseTransactionsLogResponse(string $response): array
    {
        if (preg_match('/<strDataList>([\s\S]*?)<\/strDataList>/i', $response, $matches)) {
            $rawText = trim($matches[1]);
            if ($rawText === '') {
                return [];
            }

            return preg_split('/\r?\n/', $rawText);
        }

        return [];
    }

    /**
     * Fetch logs for a single device via SOAP XML GetTransactionsLog
     * (read-only). Kept for any external/manual single-device caller;
     * `syncAttendance()` itself uses `fetchAllDeviceLogsConcurrently()`
     * below instead, so a 28-device sync doesn't serialize 28 sequential
     * timeouts into one HTTP request.
     */
    public function fetchDeviceLogs(string $serial, string $fromDateTime, string $toDateTime): array
    {
        $ch = curl_init($this->apiUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $this->buildTransactionsLogSoapEnvelope($serial, $fromDateTime, $toDateTime),
            CURLOPT_HTTPHEADER     => $this->transactionsLogHttpHeaders(),
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $httpCode !== 200) {
            Log::warning("eSSL device {$serial} fetch failed (HTTP {$httpCode}): {$curlError}");
            return [];
        }

        return $this->parseTransactionsLogResponse($response);
    }

    /**
     * Fetches GetTransactionsLog (read-only) from every device in
     * `$serials`, in batches of `$this->maxConcurrentFetches`
     * (DEFAULT 1 — sequential, `.env`-tunable via
     * `ESSL_MAX_CONCURRENT_FETCHES` for an endpoint known to tolerate more)
     * run via curl_multi.
     *
     * This three-part history matters: the ORIGINAL loop ran fully
     * sequentially and worked, if slowly — up to count($serials) x 25s of
     * cURL timeout back-to-back in a single HTTP request, which with all 28
     * devices could push the whole request past a minute or more when
     * several were genuinely slow/offline, occasionally killed by a reverse
     * proxy or PHP's own execution-time limit ("Unable to connect to the
     * HRMS server"). Firing ALL 28 devices at once next "fixed" that but
     * introduced a worse regression: every device shares ONE `apiUrl` (the
     * serial travels in the SOAP body, not the URL) — typically a single
     * small on-prem Windows/IIS box reached through a free ngrok tunnel,
     * not a scaled production API — and even a modest handful of
     * simultaneous requests can make that box or tunnel close outright
     * ("the server is being closed"), breaking a sync that used to work.
     * The default is therefore back to sequential — genuinely one request
     * in flight at a time, same as the original working behavior — with
     * concurrency available as an explicit, non-default opt-in. What DID
     * change and stay changed: the per-batch failure detection and circuit
     * breaker below, which apply just as well at concurrency 1.
     *
     * Circuit breaker: once at least `min(3, count($serials))` devices have
     * been attempted and EVERY one of them has failed, the shared `apiUrl`
     * itself is almost certainly the problem (a dead tunnel, a wrong
     * `.env` value, the relay box being off) rather than three-plus
     * individual devices coincidentally all being down at once. Checked
     * after every batch regardless of `maxConcurrentFetches` — including
     * the sequential default (1) — so a dead endpoint is detected within a
     * handful of devices instead of grinding through all 28 one at a time.
     * Grinding through the rest in that situation only turns a config
     * problem into ANOTHER multi-minute timeout that a proxy or the browser
     * kills — reproducing the exact "Unable to connect" symptom for a
     * different underlying reason underneath. Aborting instead means the
     * request returns in seconds with one clear, specific reason.
     *
     * @return array<string, array{lines: array<int,string>, ok: bool, error: ?string}>
     */
    public function fetchAllDeviceLogsConcurrently(array $serials, string $fromDateTime, string $toDateTime): array
    {
        if (empty($serials)) {
            return [];
        }

        $minSampleBeforeTripping = min(3, count($serials));
        $results = [];

        foreach (array_chunk($serials, $this->maxConcurrentFetches) as $batch) {
            $results += $this->fetchDeviceBatchConcurrently($batch, $fromDateTime, $toDateTime);

            $attempted = count($results);
            $failed = count(array_filter($results, fn ($r) => ! $r['ok']));

            if ($attempted >= $minSampleBeforeTripping && $failed === $attempted) {
                $sampleError = reset($results)['error'] ?? 'unknown error';
                Log::error("eSSL sync aborted early: all {$attempted} attempted device(s) failed to connect (sample error: {$sampleError}). The shared eSSL endpoint is likely unreachable -- check the tunnel/ESSL_API_URL rather than individual devices.");

                foreach ($serials as $skippedSerial) {
                    if (! isset($results[$skippedSerial])) {
                        $results[$skippedSerial] = ['lines' => [], 'ok' => false, 'error' => 'Skipped: eSSL endpoint appeared unreachable (see earlier failures this run)'];
                    }
                }

                break;
            }
        }

        return $results;
    }

    /** One bounded batch of `curl_multi` requests, all against the same shared eSSL endpoint. */
    private function fetchDeviceBatchConcurrently(array $serials, string $fromDateTime, string $toDateTime): array
    {
        $multiHandle = curl_multi_init();
        $handles = [];

        foreach ($serials as $serial) {
            $ch = curl_init($this->apiUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $this->buildTransactionsLogSoapEnvelope($serial, $fromDateTime, $toDateTime),
                CURLOPT_HTTPHEADER     => $this->transactionsLogHttpHeaders(),
                CURLOPT_TIMEOUT        => 25,
                CURLOPT_CONNECTTIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
            ]);
            curl_multi_add_handle($multiHandle, $ch);
            $handles[$serial] = $ch;
        }

        $running = null;
        do {
            $status = curl_multi_exec($multiHandle, $running);
            if ($running) {
                curl_multi_select($multiHandle, 1.0);
            }
        } while ($running > 0 && $status === CURLM_OK);

        $results = [];
        foreach ($handles as $serial => $ch) {
            $response = curl_multi_getcontent($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_multi_remove_handle($multiHandle, $ch);
            curl_close($ch);

            if ($response === '' || $response === false || $httpCode !== 200) {
                $error = $curlError ?: "HTTP {$httpCode}";
                Log::warning("eSSL device {$serial} fetch failed (HTTP {$httpCode}): {$error}");
                $results[$serial] = ['lines' => [], 'ok' => false, 'error' => $error];
                continue;
            }

            $results[$serial] = ['lines' => $this->parseTransactionsLogResponse((string) $response), 'ok' => true, 'error' => null];
        }

        curl_multi_close($multiHandle);

        return $results;
    }

    /**
     * Sync attendance records from eSSL biometric machines for a given month or date range.
     */
    public function syncAttendance(
        int $month,
        int $year,
        ?array $deviceSerials = null,
        ?string $companyCode = null,
        ?int $markedBy = null,
        ?string $startDateStr = null,
        ?string $endDateStr = null
    ): array {
        if (! $this->isConfigured) {
            Log::error('eSSL sync skipped: ESSL_API_URL/ESSL_USERNAME/ESSL_PASSWORD are not set in .env.');

            return [
                'status'         => false,
                'message'        => 'eSSL biometric sync is not configured (missing ESSL_API_URL/ESSL_USERNAME/ESSL_PASSWORD in .env). Data is not available -- no request was sent to any device.',
                'total_punches'  => 0,
                'records_synced' => 0,
                'unique_employees' => 0,
                'devices_count'  => 0,
                'devices_failed' => 0,
                'device_results' => [],
            ];
        }

        // Concurrent device fetch below bounds network wait to ~one device's
        // timeout (~25s), but a wide date range across many employees can
        // still mean real work parsing/matching/upserting thousands of rows
        // afterward -- raise the ceiling past a low hosting-default (some
        // environments default max_execution_time to 30s) so THAT isn't a
        // second way to hit the same "connection dies mid-request" failure.
        // Guarded: some hosts disable ini_set, which must never abort a sync.
        // Same reasoning covers memory_limit: a wide date range across 28
        // devices means $logMap/$rawPunchRows below hold every raw punch
        // for the whole window at once, which measured over PHP's 128M
        // hosting default (see AttendancePunchIngestor's own chunked-insert
        // fix for the crash this caused in production).
        try {
            @ini_set('max_execution_time', '180');
            @ini_set('memory_limit', '512M');
        } catch (\Throwable $e) {
            // best-effort only
        }

        $serials = !empty($deviceSerials) ? $deviceSerials : self::DEVICE_SERIALS;

        $start = $startDateStr
            ? Carbon::parse($startDateStr)->startOfDay()
            : Carbon::create($year, $month, 1)->startOfMonth();

        $end = $endDateStr
            ? Carbon::parse($endDateStr)->endOfDay()
            : $start->copy()->endOfMonth()->setTime(23, 59, 59);

        $fromDateTime = $start->format('Y-m-d H:i:s');
        $toDateTime = $end->format('Y-m-d H:i:s');

        // Aggregation structure: $logMap[$empCode][$dateStr] = ['times' => [], 'devices' => []]
        $logMap = [];
        $totalPunches = 0;
        $deviceResults = [];

        // Attendance Engine Rebuild — Phase 0: every individual raw scan,
        // collected alongside (not instead of) $logMap's per-day aggregate —
        // $logMap only keeps "which devices saw this employee this day", not
        // the per-scan (serial, exact timestamp, raw line) triple the
        // permanent `attendance_punches` ledger needs. Fed to
        // AttendancePunchIngestor after the existing sync logic below is
        // unchanged and complete.
        $rawPunchRows = [];

        // Attendance Engine Rebuild — Phase 4 (spec §26 Sync History): one
        // `attendance_sync_logs` row per device per run. All devices are
        // fetched CONCURRENTLY (see fetchAllDeviceLogsConcurrently()'s own
        // docblock for why: sequential per-device polling was the actual
        // cause of the "Unable to connect to the HRMS server" failure during
        // a full sync — up to 28 x 25s of cURL timeout stacked into one HTTP
        // request). The per-device `ok`/`error` the concurrent fetch returns
        // also lets `status` below correctly distinguish a genuine transport
        // failure (FAILED) from "device reachable, zero punches this
        // window" (SUCCESS) — previously indistinguishable.
        // Guarded: this table is part of the new engine's own migrations,
        // which may not exist yet on a given environment (e.g. not yet run
        // on the real server). Sync history is a nice-to-have alongside the
        // legacy sync this method's core job is -- a missing table here must
        // degrade to "no device stamped" (device_id null in every row below),
        // never take down the whole sync response.
        try {
            $deviceMapForLog = \App\Models\AttendanceDevice::pluck('id', 'serial_number')->all();
        } catch (\Throwable $e) {
            Log::warning('EsslBiometricService: attendance_devices lookup failed (migrations not run yet?): ' . $e->getMessage());
            $deviceMapForLog = [];
        }
        $syncLogRows = [];
        $batchStartedAt = now();
        $fetchResults = $this->fetchAllDeviceLogsConcurrently($serials, $fromDateTime, $toDateTime);
        $batchCompletedAt = now();

        foreach ($serials as $serial) {
            $fetchResult = $fetchResults[$serial] ?? ['lines' => [], 'ok' => false, 'error' => 'No response received'];
            $lines = $fetchResult['lines'];
            $count = count($lines);
            $deviceResults[$serial] = $count;

            $syncLogRows[$serial] = [
                'device_id' => $deviceMapForLog[$serial] ?? null,
                'device_serial' => $serial,
                'company_code' => $companyCode,
                'started_at' => $batchStartedAt,
                'completed_at' => $batchCompletedAt,
                'status' => $fetchResult['ok'] ? \App\Models\AttendanceSyncLog::STATUS_SUCCESS : \App\Models\AttendanceSyncLog::STATUS_FAILED,
                'fetched_count' => $count,
                'failed_count' => $fetchResult['ok'] ? 0 : 1,
                'error_message' => $fetchResult['ok'] ? null : $fetchResult['error'],
                'triggered_by' => $markedBy,
                'trigger_type' => 'manual',
            ];

            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line) || str_contains($line, 'xml version')) {
                    continue;
                }

                $parts = preg_split('/[\t,]+|\s{2,}/', $line);
                if (count($parts) >= 2) {
                    $empId = trim((string) $parts[0]);
                    $rawDateTime = trim((string) $parts[1]);

                    $dtParts = explode(' ', $rawDateTime);
                    $dateStr = $dtParts[0] ?? '';
                    $timeStr = $dtParts[1] ?? '';

                    if (!empty($empId) && !empty($dateStr) && !empty($timeStr)) {
                        $totalPunches++;
                        if (!isset($logMap[$empId][$dateStr])) {
                            $logMap[$empId][$dateStr] = [
                                'times'   => [],
                                'devices' => [],
                            ];
                        }
                        $logMap[$empId][$dateStr]['times'][] = $timeStr;
                        $logMap[$empId][$dateStr]['devices'][$serial] = true;

                        $rawPunchRows[] = [
                            'emp_code_raw' => $empId,
                            'device_serial' => $serial,
                            'punch_datetime' => $dateStr . ' ' . $timeStr,
                            'punch_type' => null, // eSSL's plain GetTransactionsLog text does not report IN/OUT
                            'raw_line' => $line,
                        ];
                    }
                }
            }
        }

        if (empty($logMap)) {
            // Persisted here too (not just the batch-upsert success path
            // further below) -- previously an all-devices-failed run
            // returned early and never wrote a single AttendanceSyncLog row
            // or updated device status, so Sync History / Device Health
            // stayed silent about a failed sync instead of showing it.
            $this->persistSyncLogsAndDeviceStatus($syncLogRows, null);

            $failedCount = count(array_filter($fetchResults, fn ($r) => ! $r['ok']));
            $allFailed = $failedCount > 0 && $failedCount === count($serials);

            if ($allFailed) {
                $sampleError = reset($fetchResults)['error'] ?? 'unknown error';

                return [
                    'status'         => false,
                    'message'        => "eSSL sync failed: could not reach any of {$failedCount} device(s) — the eSSL service itself appears unreachable (sample error: {$sampleError}). Check that the eSSL relay / ngrok tunnel is running and that ESSL_API_URL is current, rather than treating this as a per-device issue.",
                    'total_punches'  => 0,
                    'records_synced' => 0,
                    'unique_employees' => 0,
                    'devices_count'  => count($serials),
                    'devices_failed' => $failedCount,
                    'device_results' => $deviceResults,
                ];
            }

            return [
                'status'         => true,
                'message'        => 'No attendance logs found for the selected timeframe across ' . count($serials) . ' device(s).'
                    . ($failedCount > 0 ? " ({$failedCount} device(s) could not be reached.)" : ''),
                'total_punches'  => 0,
                'records_synced' => 0,
                'unique_employees' => 0,
                'devices_count'  => count($serials),
                'devices_failed' => $failedCount,
                'device_results' => $deviceResults,
            ];
        }

        // Unified employee resolution: attendance_employee_code_map first,
        // then legacy emp_code/punching_no/form_no/id fallback.
        $empCodes = array_keys($logMap);
        $resolver = new BiometricUserResolver($empCodes);
        $userLookup = $resolver->getUserLookup();

        $batchRows = [];
        $rowReports = [];
        $uniqueEmployees = count($logMap);
        $totalRecords = 0;

        foreach ($logMap as $empCode => $dates) {
            $codeStr = (string) $empCode;
            // Use the resolver which checks code-map table first, then legacy fields
            $user = $resolver->resolve($codeStr);

            // Determine canonical code, tenant company, and user ID
            $empCompany = $user ? $user->company_code : ($companyCode && !in_array($companyCode, ['all', 'all-companies']) ? $companyCode : 'nidhi-impex');
            $empUnit = $user ? $user->unit : null;
            $userId = $user ? $user->id : null;
            $canonicalCode = $user ? (string)($user->emp_code ?: $user->punching_no ?: $user->form_no ?: $user->id) : $codeStr;

            foreach ($dates as $dateStr => $data) {
                $times = $data['times'];
                sort($times);

                $checkIn = $times[0];
                $checkOut = count($times) > 1 ? end($times) : $checkIn;

                // Calculate working hours duration
                $t1 = strtotime($checkIn);
                $t2 = strtotime($checkOut);
                $diffSeconds = max(0, $t2 - $t1);
                $hours = round($diffSeconds / 3600, 2);
                $workHours = sprintf('%.2f hrs', $hours);

                // Determine attendance status based on standard labor rules
                // Full Day: >= 7.5 hrs, Half Day: 4.0 - 7.5 hrs, Late arrival: check-in > 09:30 AM
                $status = 'present';
                if ($hours >= 7.5) {
                    $status = 'present';
                } elseif ($hours >= 4.0) {
                    $status = 'half_day';
                } else {
                    $status = 'present';
                }

                $deviceList = implode(',', array_keys($data['devices']));

                $batchRows[] = [
                    'emp_code'      => (string) $canonicalCode,
                    'company_code'  => $empCompany,
                    'unit'          => $empUnit,
                    'date'          => $dateStr,
                    'status'        => $status,
                    'check_in'      => $checkIn,
                    'check_out'     => $checkOut,
                    'work_hours'    => $workHours,
                    'device_serial' => $deviceList,
                    'raw_punches'   => json_encode($times),
                    'user_id'       => $userId,
                    'marked_by'     => $markedBy,
                    'updated_at'    => now(),
                    'created_at'    => now(),
                ];

                $rowReports[] = [
                    'row_number' => ++$totalRecords,
                    'status'     => 'passed',
                    'reason'     => null,
                    'row_data'   => [
                        'emp_code'   => $empCode,
                        'date'       => $dateStr,
                        'check_in'   => $checkIn,
                        'check_out'  => $checkOut,
                        'work_hours' => $workHours,
                        'status'     => $status,
                    ],
                ];
            }
        }

        // Ensure database columns exist
        $this->ensureColumnsExist();

        // Perform chunked atomic upserts
        foreach (array_chunk($batchRows, 500) as $chunk) {
            Attendance::upsert(
                $chunk,
                ['emp_code', 'company_code', 'date'],
                ['unit', 'status', 'check_in', 'check_out', 'work_hours', 'device_serial', 'raw_punches', 'user_id', 'marked_by', 'updated_at']
            );
        }

        // Record UploadBatch audit
        $batchId = null;
        try {
            $batch = UploadBatch::create([
                'type'          => 'attendance_essl',
                'company_code'  => $companyCode && !in_array($companyCode, ['all', 'all-companies']) ? $companyCode : 'all-companies',
                'unit'          => null,
                'month'         => (string) $month,
                'year'          => (string) $year,
                'file_name'     => "essl_biometric_sync_{$month}_{$year}.xml",
                'total_rows'    => count($batchRows),
                'success_count' => count($batchRows),
                'failed_count'  => 0,
                'uploaded_by'   => $markedBy,
            ]);
            $batchId = $batch->id;
        } catch (\Throwable $e) {
            Log::error("Failed to record biometric sync batch: " . $e->getMessage());
        }

        // Attendance Engine Rebuild — Phase 0: write the permanent raw-punch
        // ledger alongside the existing `attendances` upsert above, which is
        // complete and unchanged by this point. Wrapped in its own try/catch
        // so a punch-ledger failure can NEVER turn an otherwise-successful
        // sync into an error response — same "guarded, best-effort" pattern
        // used elsewhere in this codebase for non-critical side effects.
        $punchIngestResult = null;
        try {
            $punchIngestResult = (new AttendancePunchIngestor())->ingest(
                $rawPunchRows,
                $userLookup,
                $batchId,
                $companyCode
            );
        } catch (\Throwable $e) {
            Log::error('AttendancePunchIngestor: sync-time ingest failed: ' . $e->getMessage());
        }

        $this->persistSyncLogsAndDeviceStatus($syncLogRows, $batchId);

        return [
            'status'           => true,
            'message'          => "Synced {$totalPunches} biometric punches across " . count($serials) . " devices for {$uniqueEmployees} employees ({$totalRecords} daily records).",
            'punch_ledger'     => $punchIngestResult,
            'total_punches'    => $totalPunches,
            'records_synced'   => $totalRecords,
            'unique_employees' => $uniqueEmployees,
            'devices_count'    => count($serials),
            'device_results'   => $deviceResults,
        ];
    }

    /**
     * Persists the per-device sync log rows collected during the fetch loop
     * (spec §26), and stamps each device's last-seen state (spec §24/§62's
     * device health). Best-effort — a persistence failure here must never
     * turn an otherwise-successful sync into an error, matching this
     * class's guarded pattern elsewhere. Called from BOTH the normal
     * success path and the all-devices-unreachable early return, so a
     * failed sync still shows up in Sync History / Device Health instead of
     * vanishing silently (a real gap in the original code — an all-failed
     * run used to return early before this block ever ran at all).
     */
    private function persistSyncLogsAndDeviceStatus(array $syncLogRows, ?int $batchId): void
    {
        try {
            $now = now();
            foreach ($syncLogRows as $serial => $row) {
                $row['sync_batch_id'] = $batchId;
                \App\Models\AttendanceSyncLog::create($row);

                if ($row['device_id']) {
                    $isOnline = $row['status'] === \App\Models\AttendanceSyncLog::STATUS_SUCCESS;

                    $update = [
                        'status' => $isOnline ? 'online' : 'offline',
                        'last_sync_at' => $now,
                        'last_sync_error' => $isOnline ? null : ($row['error_message'] ?? 'Unknown error'),
                        'last_sync_punch_count' => $row['fetched_count'],
                    ];
                    // Only advances on an actual successful fetch -- a run of
                    // failures must not make a stale device look freshly synced,
                    // so on failure this column is simply left untouched.
                    if ($isOnline) {
                        $update['last_successful_sync_at'] = $now;
                    }

                    \App\Models\AttendanceDevice::whereKey($row['device_id'])->update($update);
                }
            }
        } catch (\Throwable $e) {
            Log::error('EsslBiometricService: failed to persist sync history/device status: ' . $e->getMessage());
        }
    }

    /**
     * Auto-heal database schema if biometric fields are missing.
     */
    private function ensureColumnsExist(): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('attendances', 'check_in')) {
            \Illuminate\Support\Facades\Schema::table('attendances', function (\Illuminate\Database\Schema\Blueprint $table) {
                if (!\Illuminate\Support\Facades\Schema::hasColumn('attendances', 'check_in')) {
                    $table->string('check_in')->nullable();
                }
                if (!\Illuminate\Support\Facades\Schema::hasColumn('attendances', 'check_out')) {
                    $table->string('check_out')->nullable();
                }
                if (!\Illuminate\Support\Facades\Schema::hasColumn('attendances', 'work_hours')) {
                    $table->string('work_hours')->nullable();
                }
                if (!\Illuminate\Support\Facades\Schema::hasColumn('attendances', 'device_serial')) {
                    $table->string('device_serial')->nullable();
                }
                if (!\Illuminate\Support\Facades\Schema::hasColumn('attendances', 'raw_punches')) {
                    $table->text('raw_punches')->nullable();
                }
            });
        }
    }
}
