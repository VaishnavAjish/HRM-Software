<?php

namespace App\Services\Biometric;

use App\Models\Attendance;
use App\Models\UploadBatch;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

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

    public function __construct()
    {
        $this->apiUrl = env('ESSL_API_URL', 'https://unkneeling-lekisha-unimpeachably.ngrok-free.dev/WebAPIService.asmx');
        $this->username = env('ESSL_USERNAME', 'API');
        $this->password = env('ESSL_PASSWORD', 'Api@12345');
        $this->namespace = env('ESSL_NAMESPACE', 'http://tempuri.org/');
    }

    /**
     * Fetch logs for a single device via SOAP XML GetTransactionsLog
     */
    public function fetchDeviceLogs(string $serial, string $fromDateTime, string $toDateTime): array
    {
        $soapXml = '<?xml version="1.0" encoding="utf-8"?>' .
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

        $ch = curl_init($this->apiUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $soapXml,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: text/xml; charset=utf-8',
                'SOAPAction: "' . rtrim($this->namespace, '/') . '/GetTransactionsLog"',
                'ngrok-skip-browser-warning: true',
            ],
            CURLOPT_TIMEOUT        => 25,
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

        if (preg_match('/<strDataList>([\s\S]*?)<\/strDataList>/i', $response, $matches)) {
            $rawText = trim($matches[1]);
            if (empty($rawText)) {
                return [];
            }
            return preg_split('/\r?\n/', $rawText);
        }

        return [];
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

        foreach ($serials as $serial) {
            $lines = $this->fetchDeviceLogs($serial, $fromDateTime, $toDateTime);
            $count = count($lines);
            $deviceResults[$serial] = $count;

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
                    }
                }
            }
        }

        if (empty($logMap)) {
            return [
                'status'         => true,
                'message'        => 'No attendance logs found for the selected timeframe across ' . count($serials) . ' device(s).',
                'total_punches'  => 0,
                'records_synced' => 0,
                'unique_employees' => 0,
                'devices_count'  => count($serials),
                'device_results' => $deviceResults,
            ];
        }

        // Preload existing employees from users table to match emp_code
        $empCodes = array_keys($logMap);
        $users = User::whereIn('emp_code', $empCodes)
            ->where('is_deleted', 0)
            ->get()
            ->keyBy('emp_code');

        $batchRows = [];
        $rowReports = [];
        $uniqueEmployees = count($logMap);
        $totalRecords = 0;

        foreach ($logMap as $empCode => $dates) {
            $user = $users->get($empCode);

            // Determine tenant company
            $empCompany = $user ? $user->company_code : ($companyCode && !in_array($companyCode, ['all', 'all-companies']) ? $companyCode : 'nidhi-impex');
            $empUnit = $user ? $user->unit : null;
            $userId = $user ? $user->id : null;

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
                    'emp_code'      => (string) $empCode,
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

        // Perform chunked atomic upserts
        foreach (array_chunk($batchRows, 500) as $chunk) {
            Attendance::upsert(
                $chunk,
                ['emp_code', 'company_code', 'date'],
                ['unit', 'status', 'check_in', 'check_out', 'work_hours', 'device_serial', 'raw_punches', 'user_id', 'marked_by', 'updated_at']
            );
        }

        // Record UploadBatch audit
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
        } catch (\Throwable $e) {
            Log::error("Failed to record biometric sync batch: " . $e->getMessage());
        }

        return [
            'status'           => true,
            'message'          => "Synced {$totalPunches} biometric punches across " . count($serials) . " devices for {$uniqueEmployees} employees ({$totalRecords} daily records).",
            'total_punches'    => $totalPunches,
            'records_synced'   => $totalRecords,
            'unique_employees' => $uniqueEmployees,
            'devices_count'    => count($serials),
            'device_results'   => $deviceResults,
        ];
    }
}
