<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Services\Attendance\AttendanceReportService;
use App\Support\CsvSanitizer;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * `GET /v1/attendance/reports/{type}` (JSON preview), `GET
 * /v1/attendance/reports/{type}/export` (CSV or PDF), `GET
 * /v1/attendance/dashboard` — spec §71's "12 report types" + dashboard
 * analytics. Mirrors `Mediclaim\Admin\ReportController`'s columns/rows shape
 * and its CSV export pattern (`streamDownload` + UTF-8 BOM + `fputcsv` +
 * `CsvSanitizer`); PDF export reuses one generic Blade table view for all
 * 12 types rather than one bespoke view per report.
 */
class AttendanceReportController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(private readonly AttendanceReportService $service)
    {
    }

    public function index(Request $request, string $type): JsonResponse
    {
        if (! in_array($type, AttendanceReportService::TYPES, true)) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'INVALID_REPORT_TYPE', 'message' => 'reportType must be one of: '.implode(', ', AttendanceReportService::TYPES)],
            ], 422);
        }

        $report = $this->service->build($type, $request);

        return $this->ok([
            'reportType' => $type,
            'columns' => $report['columns'],
            'rows' => $report['rows'],
            'meta' => ['count' => count($report['rows']), 'generatedAt' => now()->toIso8601String()],
        ]);
    }

    public function export(Request $request, string $type): StreamedResponse|Response|JsonResponse
    {
        if (! in_array($type, AttendanceReportService::TYPES, true)) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'INVALID_REPORT_TYPE', 'message' => 'reportType must be one of: '.implode(', ', AttendanceReportService::TYPES)],
            ], 422);
        }

        $format = strtolower((string) $request->query('format', 'csv'));
        $report = $this->service->build($type, $request);
        $columns = $report['columns'];
        $rows = $report['rows'];

        if ($format === 'pdf') {
            return $this->exportPdf($type, $columns, $rows);
        }

        return $this->exportCsv($type, $columns, $rows);
    }

    /** `GET /v1/attendance/dashboard` — aggregate KPIs + chart-ready series. */
    public function dashboard(Request $request): JsonResponse
    {
        return $this->ok($this->service->dashboard($request));
    }

    private function exportCsv(string $type, array $columns, array $rows): StreamedResponse
    {
        $callback = function () use ($columns, $rows) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel doesn't mangle names/special chars
            fputcsv($handle, array_values($columns));

            foreach ($rows as $row) {
                fputcsv($handle, array_map(
                    static fn ($key) => CsvSanitizer::sanitizeCell(
                        is_bool($row[$key] ?? null) ? (($row[$key]) ? 'Yes' : 'No') : (string) ($row[$key] ?? '')
                    ),
                    array_keys($columns)
                ));
            }

            fclose($handle);
        };

        return response()->streamDownload(
            $callback,
            'attendance-'.$type.'-'.now()->format('Ymd-His').'.csv',
            ['Content-Type' => 'text/csv; charset=UTF-8']
        );
    }

    private function exportPdf(string $type, array $columns, array $rows): Response
    {
        $pdf = Pdf::loadView('attendance.report', [
            'title' => ucwords(str_replace('_', ' ', $type)).' Report',
            'columns' => $columns,
            'rows' => $rows,
            'generatedAt' => now()->format('d M Y, H:i'),
        ])->setPaper('a4', 'landscape');

        return $pdf->download('attendance-'.$type.'-'.now()->format('Ymd-His').'.pdf');
    }
}
