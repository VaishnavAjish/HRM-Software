<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SystemHealthController extends Controller
{
    /**
     * Get real-time server telemetry: CPU load, Memory, Disk Storage, Database, Uptime.
     */
    public function index(): JsonResponse
    {
        // 1. Disk Storage Calculation
        $diskPath = base_path();
        $diskTotal = @disk_total_space($diskPath) ?: (100 * 1024 * 1024 * 1024);
        $diskFree = @disk_free_space($diskPath) ?: (70 * 1024 * 1024 * 1024);
        $diskUsed = $diskTotal - $diskFree;
        $diskPercentage = $diskTotal > 0 ? round(($diskUsed / $diskTotal) * 100, 1) : 0;

        // 2. CPU Load Calculation
        $cpuLoad = [0.0, 0.0, 0.0];
        if (function_exists('sys_getloadavg')) {
            $load = sys_getloadavg();
            if (is_array($load) && count($load) >= 3) {
                $cpuLoad = [
                    round($load[0], 2),
                    round($load[1], 2),
                    round($load[2], 2),
                ];
            }
        }
        // Approximate CPU % based on 1-min load avg
        $cpuCores = 1;
        if (is_readable('/proc/cpuinfo')) {
            $cpuinfo = file_get_contents('/proc/cpuinfo');
            $cpuCores = max(1, substr_count($cpuinfo, 'processor'));
        }
        $cpuPercentage = min(100, round(($cpuLoad[0] / $cpuCores) * 100, 1));

        // 3. Memory RAM Calculation
        $memoryTotal = 0;
        $memoryFree = 0;
        $memoryAvailable = 0;

        if (is_readable('/proc/meminfo')) {
            $memInfo = file_get_contents('/proc/meminfo');
            if (preg_match('/MemTotal:\s+(\d+)\s+kB/i', $memInfo, $matches)) {
                $memoryTotal = (int)$matches[1] * 1024;
            }
            if (preg_match('/MemAvailable:\s+(\d+)\s+kB/i', $memInfo, $matches)) {
                $memoryAvailable = (int)$matches[1] * 1024;
            } elseif (preg_match('/MemFree:\s+(\d+)\s+kB/i', $memInfo, $matches)) {
                $memoryAvailable = (int)$matches[1] * 1024;
            }
        }

        if ($memoryTotal <= 0) {
            $memoryTotal = 4 * 1024 * 1024 * 1024; // Fallback 4GB
            $memoryAvailable = 2.5 * 1024 * 1024 * 1024;
        }

        $memoryUsed = max(0, $memoryTotal - $memoryAvailable);
        $memoryPercentage = $memoryTotal > 0 ? round(($memoryUsed / $memoryTotal) * 100, 1) : 0;

        // 4. Database Ping & Response Latency
        $dbStart = microtime(true);
        $dbStatus = 'healthy';
        $dbLatencyMs = 0;
        try {
            DB::select('SELECT 1');
            $dbLatencyMs = round((microtime(true) - $dbStart) * 1000, 2);
        } catch (\Throwable $e) {
            $dbStatus = 'unhealthy';
            Log::error("Database health check failed: " . $e->getMessage());
        }

        // 5. System Uptime
        $uptimeSeconds = 0;
        if (is_readable('/proc/uptime')) {
            $uptimeStr = file_get_contents('/proc/uptime');
            $uptimeParts = explode(' ', trim($uptimeStr));
            $uptimeSeconds = (int)($uptimeParts[0] ?? 0);
        }

        $formattedUptime = $this->formatUptime($uptimeSeconds);

        return response()->json([
            'status' => true,
            'message' => 'System telemetry retrieved successfully',
            'data' => [
                'cpu' => [
                    'percentage' => $cpuPercentage,
                    'cores' => $cpuCores,
                    'load_avg' => $cpuLoad,
                    'status' => $cpuPercentage > 85 ? 'warning' : 'normal',
                ],
                'memory' => [
                    'total_bytes' => $memoryTotal,
                    'used_bytes' => $memoryUsed,
                    'free_bytes' => $memoryAvailable,
                    'percentage' => $memoryPercentage,
                    'formatted_total' => $this->formatBytes($memoryTotal),
                    'formatted_used' => $this->formatBytes($memoryUsed),
                    'formatted_free' => $this->formatBytes($memoryAvailable),
                    'status' => $memoryPercentage > 90 ? 'warning' : 'normal',
                ],
                'storage' => [
                    'total_bytes' => $diskTotal,
                    'used_bytes' => $diskUsed,
                    'free_bytes' => $diskFree,
                    'percentage' => $diskPercentage,
                    'formatted_total' => $this->formatBytes($diskTotal),
                    'formatted_used' => $this->formatBytes($diskUsed),
                    'formatted_free' => $this->formatBytes($diskFree),
                    'status' => $diskPercentage > 85 ? 'warning' : 'normal',
                ],
                'database' => [
                    'status' => $dbStatus,
                    'latency_ms' => $dbLatencyMs,
                    'connection' => config('database.default'),
                ],
                'server' => [
                    'php_version' => PHP_VERSION,
                    'laravel_version' => app()->version(),
                    'os' => PHP_OS_FAMILY,
                    'uptime_seconds' => $uptimeSeconds,
                    'formatted_uptime' => $formattedUptime,
                    'server_time' => now()->toIso8601String(),
                ],
            ],
        ]);
    }

    private function formatBytes(int|float $bytes): string
    {
        if ($bytes <= 0) return '0 B';
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = (int)floor(log($bytes, 1024));
        return round($bytes / pow(1024, $i), 2) . ' ' . ($units[$i] ?? 'B');
    }

    private function formatUptime(int $seconds): string
    {
        if ($seconds <= 0) return 'Just started';
        $days = floor($seconds / 86400);
        $hours = floor(($seconds % 86400) / 3600);
        $mins = floor(($seconds % 3600) / 60);

        $parts = [];
        if ($days > 0) $parts[] = "{$days}d";
        if ($hours > 0) $parts[] = "{$hours}h";
        $parts[] = "{$mins}m";

        return implode(' ', $parts);
    }
}
