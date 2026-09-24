<?php

namespace App\Services\Biometric;

use App\Models\AttendanceDevice;
use App\Models\AttendanceEmployeeCodeMap;
use App\Models\AttendancePunch;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Attendance Engine Rebuild — Phase 0.
 *
 * Writes raw biometric scans into the permanent `attendance_punches` ledger
 * and applies the configurable duplicate-window classification (spec §3).
 *
 * Deliberately does NOT do employee resolution itself — it is handed the
 * exact `$userLookup` map `EsslBiometricService::syncAttendance()` already
 * builds (same emp_code/punching_no/form_no/id keys, with/without leading
 * zeros), so there is exactly one place in the codebase that knows how to
 * match a device's reported code to a `users` row, not two that can drift
 * apart. This class only decides what to do with a raw scan once identity
 * is (or isn't) known.
 */
class AttendancePunchIngestor
{
    /**
     * @param  array<int,array{emp_code_raw:string,device_serial:?string,punch_datetime:string,punch_type:?string,raw_line:?string}>  $rows
     * @param  array<string,User>  $userLookup  same shape as EsslBiometricService's own lookup: every known emp_code/punching_no/form_no/id (raw and zero-trimmed) => User
     * @return array{inserted:int,ignored_existing:int,unmapped:int,duplicates_flagged:int}
     */
    public function ingest(array $rows, array $userLookup, ?int $syncBatchId, ?string $requestedCompanyCode, string $source = AttendancePunch::SOURCE_ESSL): array
    {
        if (empty($rows)) {
            return ['inserted' => 0, 'ignored_existing' => 0, 'unmapped' => 0, 'duplicates_flagged' => 0];
        }

        $deviceMap = AttendanceDevice::pluck('id', 'serial_number')->all();
        $explicitCompany = ($requestedCompanyCode && ! in_array($requestedCompanyCode, ['all', 'all-companies'], true))
            ? $requestedCompanyCode
            : null;

        // Attendance Engine Rebuild — Phase 1 (spec §23): per-device code
        // aliases take priority over the legacy single-code lookup, so
        // "Machine A: user 1, Machine B: user 1001, both = employee 0001"
        // resolves correctly. Two maps: device-specific rows first, then
        // "any device" rows (device_id null) as the next fallback, THEN the
        // existing emp_code/punching_no/form_no/id matching last.
        $deviceCodeMap = AttendanceEmployeeCodeMap::query()
            ->where('is_active', true)->whereNotNull('device_id')
            ->get(['device_id', 'device_user_code', 'user_id'])
            ->keyBy(fn ($m) => $m->device_id . '|' . $m->device_user_code);
        $anyDeviceCodeMap = AttendanceEmployeeCodeMap::query()
            ->where('is_active', true)->whereNull('device_id')
            ->pluck('user_id', 'device_user_code');
        $userIds = array_unique(array_merge($deviceCodeMap->pluck('user_id')->all(), $anyDeviceCodeMap->values()->all()));
        $usersById = $userIds ? User::whereIn('id', $userIds)->get()->keyBy('id') : collect();

        $now = now();
        $unmappedCount = 0;
        $touchedKeys = []; // dedupe-scan work list: "u{id}|{date}" or "c{company}|{code}|{date}"

        // Inserted in bounded chunks AS the source rows are walked, rather
        // than collecting every row into one array first -- a full month
        // across 28 devices can be tens of thousands of rows, and building
        // that whole array before the first insert is what previously blew
        // past PHP's 128M memory_limit and fatally crashed the request
        // (uncatchable -- try/catch below cannot recover from it, so it
        // must never be allowed to happen in the first place).
        $chunkSize = 500;
        $pendingChunk = [];
        $insertedTotal = 0;
        $totalRows = 0;

        try {
            foreach ($rows as $row) {
                $codeStr = (string) $row['emp_code_raw'];
                $trimmed = ltrim($codeStr, '0');
                $deviceSerial = $row['device_serial'] ?? null;
                $deviceId = $deviceSerial ? ($deviceMap[$deviceSerial] ?? null) : null;

                $user = null;
                if ($deviceId && isset($deviceCodeMap["{$deviceId}|{$codeStr}"])) {
                    $user = $usersById[$deviceCodeMap["{$deviceId}|{$codeStr}"]->user_id] ?? null;
                } elseif (isset($anyDeviceCodeMap[$codeStr])) {
                    $user = $usersById[$anyDeviceCodeMap[$codeStr]] ?? null;
                }
                $user ??= $userLookup[$codeStr] ?? ($trimmed !== '' ? ($userLookup[$trimmed] ?? null) : null);

                $punchAt = Carbon::parse($row['punch_datetime']);
                $punchDate = $punchAt->toDateString();

                $companyCode = $user?->company_code ?? $explicitCompany;
                $unit = $user?->unit;
                $status = $user ? AttendancePunch::STATUS_VALID : AttendancePunch::STATUS_UNMAPPED;
                if (! $user) {
                    $unmappedCount++;
                }

                $pendingChunk[] = [
                    'emp_code_raw' => $codeStr,
                    'device_serial' => $deviceSerial,
                    'punch_datetime' => $punchAt,
                    'punch_date' => $punchDate,
                    'attendance_day_resolved' => false,
                    'punch_type' => $row['punch_type'] ?? null,
                    'source' => $source,
                    'raw_line' => $row['raw_line'] ?? null,
                    'user_id' => $user?->id,
                    'device_id' => $deviceId,
                    'company_code' => $companyCode,
                    'unit' => $unit,
                    'sync_batch_id' => $syncBatchId,
                    'status' => $status,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
                $totalRows++;

                $touchedKeys[$user ? "u{$user->id}|{$punchDate}" : "c{$companyCode}|{$codeStr}|{$punchDate}"] = true;

                if (count($pendingChunk) >= $chunkSize) {
                    // insertOrIgnore relies on the (device_serial, emp_code_raw,
                    // punch_datetime) unique index — a re-run of the same sync
                    // window is a safe no-op, never a duplicate row (spec §25).
                    $insertedTotal += DB::table('attendance_punches')->insertOrIgnore($pendingChunk);
                    $pendingChunk = [];
                }
            }

            if (! empty($pendingChunk)) {
                $insertedTotal += DB::table('attendance_punches')->insertOrIgnore($pendingChunk);
                $pendingChunk = [];
            }
        } catch (\Throwable $e) {
            // Never let a punch-ledger write failure break the existing,
            // working `attendances` sync it rides alongside — logged only.
            Log::error('AttendancePunchIngestor: insert failed: ' . $e->getMessage());

            return ['inserted' => 0, 'ignored_existing' => 0, 'unmapped' => $unmappedCount, 'duplicates_flagged' => 0];
        }

        $duplicatesFlagged = $this->classifyDuplicates(array_keys($touchedKeys));

        return [
            'inserted' => $insertedTotal,
            'ignored_existing' => $totalRows - $insertedTotal,
            'unmapped' => $unmappedCount,
            'duplicates_flagged' => $duplicatesFlagged,
        ];
    }

    /**
     * Re-classifies VALID/DUPLICATE among every punch sharing an identity
     * (resolved user, or company+raw-code when unmapped) on a touched date,
     * ordered by punch_datetime. Idempotent and cheap — bounded to one
     * employee's one day per key, so a full historical re-scan is never
     * needed (spec §42 — do not recompute the whole history every sync).
     *
     * @param  string[]  $keys  "u{userId}|{date}" or "c{company}|{code}|{date}"
     * @return int punches whose status/duplicate_of actually changed
     */
    private function classifyDuplicates(array $keys): int
    {
        if (empty($keys)) {
            return 0;
        }

        $windowSeconds = (int) config('attendance.duplicate_window_seconds', 30);
        $changed = 0;

        foreach ($keys as $key) {
            $query = AttendancePunch::query()->orderBy('punch_datetime');

            if (str_starts_with($key, 'u')) {
                [$userId, $date] = explode('|', substr($key, 1), 2);
                $query->where('user_id', (int) $userId)->whereDate('punch_date', $date);
            } else {
                [$company, $code, $date] = explode('|', substr($key, 1), 3);
                $query->whereNull('user_id')
                    ->where('company_code', $company === '' ? null : $company)
                    ->where('emp_code_raw', $code)
                    ->whereDate('punch_date', $date);
            }

            $punches = $query->get(['id', 'punch_datetime', 'status', 'duplicate_of']);
            if ($punches->count() < 2) {
                // A single punch is always canonical/VALID by definition —
                // nothing to compare it against.
                if ($punches->count() === 1) {
                    $only = $punches->first();
                    if ($only->status === AttendancePunch::STATUS_DUPLICATE) {
                        $only->update(['status' => AttendancePunch::STATUS_VALID, 'duplicate_of' => null]);
                        $changed++;
                    }
                }
                continue;
            }

            $canonical = $punches->first();
            foreach ($punches->slice(1) as $punch) {
                $secondsSinceCanonical = $canonical->punch_datetime->diffInSeconds($punch->punch_datetime);
                $isDuplicate = $secondsSinceCanonical <= $windowSeconds;

                $wantedStatus = $isDuplicate ? AttendancePunch::STATUS_DUPLICATE : AttendancePunch::STATUS_VALID;
                $wantedDuplicateOf = $isDuplicate ? $canonical->id : null;

                if ($punch->status !== $wantedStatus || $punch->duplicate_of !== $wantedDuplicateOf) {
                    AttendancePunch::whereKey($punch->id)->update([
                        'status' => $wantedStatus,
                        'duplicate_of' => $wantedDuplicateOf,
                    ]);
                    $changed++;
                }

                if (! $isDuplicate) {
                    $canonical = $punch;
                }
            }
        }

        return $changed;
    }
}
