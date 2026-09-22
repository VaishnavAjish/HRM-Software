<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{{ $title }}</title>
<style>
    /* dompdf paginates automatically -- no fixed-height assumptions, matching
       resources/views/mediclaim/claim-form.blade.php's own convention. */
    body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #111827; margin: 0; padding: 20px; }
    h1 { font-size: 16px; margin: 0 0 4px 0; }
    .meta { font-size: 9px; color: #6b7280; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: bold; }
    tr:nth-child(even) td { background: #fafafa; }
    .empty { text-align: center; color: #9ca3af; padding: 20px; }
    .footer { margin-top: 10px; font-size: 8px; color: #9ca3af; }
</style>
</head>
<body>
    <h1>{{ $title }}</h1>
    <div class="meta">Generated {{ $generatedAt }} &middot; {{ count($rows) }} record(s) &middot; Attendance Engine Rebuild</div>

    @if(count($rows) === 0)
        <div class="empty">No records match this filter.</div>
    @else
        <table>
            <thead>
                <tr>
                    @foreach($columns as $label)
                        <th>{{ $label }}</th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @foreach($rows as $row)
                    <tr>
                        @foreach(array_keys($columns) as $key)
                            <td>
                                @php $val = $row[$key] ?? null; @endphp
                                @if(is_bool($val)) {{ $val ? 'Yes' : 'No' }}
                                @else {{ $val === null ? '' : $val }}
                                @endif
                            </td>
                        @endforeach
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <div class="footer">This report reflects the calculated attendance layer as of generation time. Raw punch history is never altered by report generation.</div>
</body>
</html>
