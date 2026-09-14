<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Mediclaim Claim Form</title>
<style>
    {{--
        dompdf-targeted CSS (see MediclaimClaimFormPdfService's docblock):
        table-based layout, no flex/grid, all display strings precomputed
        server-side so this template stays a dumb renderer. Rendered via
        Pdf::loadView('mediclaim.claim-form', [...])->setPaper('a4', 'portrait')
        — A4 portrait because this mirrors a real multi-section paper form
        (Sections A-K), not a wallet card; dompdf paginates automatically if
        content overflows a page, so no fixed-height assumptions are made
        anywhere below.
    --}}
    * { box-sizing: border-box; }
    body {
        margin: 0;
        padding: 10mm 14mm;
        font-family: Helvetica, Arial, sans-serif;
        font-size: 9pt;
        color: #1f2937;
    }
    .doc-header {
        border-bottom: 2pt solid #1d4ed8;
        padding-bottom: 3mm;
        margin-bottom: 5mm;
        overflow: hidden;
    }
    .doc-header h1 {
        margin: 0;
        font-size: 15pt;
        color: #1d4ed8;
    }
    .doc-header .subtitle {
        font-size: 8.5pt;
        color: #475569;
    }
    table.meta {
        width: 100%;
        margin-top: 2mm;
        border-collapse: collapse;
        font-size: 8pt;
    }
    table.meta td {
        padding: 0.5mm 0;
        color: #334155;
    }
    table.meta td.meta-label {
        color: #64748b;
        width: 28mm;
    }
    .section {
        margin-bottom: 4mm;
        page-break-inside: avoid;
    }
    .section-title {
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 9.5pt;
        font-weight: bold;
        padding: 1.5mm 3mm;
        margin: 0 0 2mm;
        border-left: 2.5pt solid #1d4ed8;
    }
    table.fields {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5pt;
    }
    table.fields td {
        padding: 1mm 2mm;
        vertical-align: top;
        border-bottom: 0.5pt solid #f1f5f9;
    }
    table.fields td.f-label {
        width: 45mm;
        color: #64748b;
    }
    table.fields td.f-value {
        color: #111827;
        font-weight: bold;
    }
    table.data {
        width: 100%;
        border-collapse: collapse;
        font-size: 8pt;
        margin-top: 1mm;
    }
    table.data th {
        background: #f1f5f9;
        text-align: left;
        padding: 1.5mm 2mm;
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.2pt;
        color: #475569;
        border-bottom: 1pt solid #cbd5e1;
    }
    table.data td {
        padding: 1.5mm 2mm;
        border-bottom: 0.5pt solid #f1f5f9;
    }
    table.data tfoot td {
        font-weight: bold;
        border-top: 1pt solid #cbd5e1;
        border-bottom: none;
    }
    .declaration-text {
        font-size: 8.5pt;
        line-height: 1.5;
        margin: 0 0 2mm;
        padding-left: 4mm;
    }
    .decision-block {
        border: 0.75pt solid #e2e8f0;
        border-radius: 2pt;
        padding: 2.5mm 3mm;
        margin-bottom: 3mm;
        page-break-inside: avoid;
    }
    .decision-block .db-title {
        font-size: 8.5pt;
        font-weight: bold;
        color: #1d4ed8;
        margin-bottom: 1.5mm;
    }
    .decision-block .db-pending {
        font-size: 8pt;
        color: #94a3b8;
        font-style: italic;
    }
    .decision-block table.fields td {
        border-bottom: none;
        padding: 0.5mm 2mm;
    }
    .footer-note {
        margin-top: 6mm;
        padding-top: 2mm;
        border-top: 0.5pt solid #e2e8f0;
        font-size: 6.5pt;
        color: #94a3b8;
    }
</style>
</head>
<body>
    <div class="doc-header">
        <h1>Employee Mediclaim Claim Form</h1>
        <div class="subtitle">Final record — Sections A through K</div>
        <table class="meta">
            <tr>
                <td class="meta-label">Claim Number</td>
                <td><strong>{{ $claim->claim_number ?: 'N/A' }}</strong></td>
                <td class="meta-label">Status</td>
                <td>{{ $claim->status }}</td>
            </tr>
            <tr>
                <td class="meta-label">Submitted</td>
                <td>{{ optional($claim->submitted_at)->format('d-M-Y H:i') ?: 'N/A' }}</td>
                <td class="meta-label">Company</td>
                <td>{{ $claim->company_code }}</td>
            </tr>
        </table>
    </div>

    @foreach($sections as $section)
        <div class="section">
            <div class="section-title">{{ $section['heading'] }}</div>
            <table class="fields">
                @foreach($section['fields'] as $field)
                    <tr>
                        <td class="f-label">{{ $field[0] }}</td>
                        <td class="f-value">{{ $field[1] !== null && $field[1] !== '' ? $field[1] : 'N/A' }}</td>
                    </tr>
                @endforeach
            </table>
        </div>
    @endforeach

    <div class="section">
        <div class="section-title">Section E - Medical Expenses</div>
        <table class="data">
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Claimed</th>
                    <th>Approved</th>
                    <th>Disallowed</th>
                    <th>Reason (if disallowed)</th>
                </tr>
            </thead>
            <tbody>
                @forelse($expenseRows as $row)
                    <tr>
                        <td>{{ $row['category'] }}</td>
                        <td>{{ $row['description'] ?: 'N/A' }}</td>
                        <td>{{ $row['date'] ?: 'N/A' }}</td>
                        <td>{{ $row['claimed'] }}</td>
                        <td>{{ $row['approved'] }}</td>
                        <td>{{ $row['disallowed'] }}</td>
                        <td>{{ $row['reason'] ?: 'N/A' }}</td>
                    </tr>
                @empty
                    <tr><td colspan="7">No expense line items recorded.</td></tr>
                @endforelse
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="3">Total</td>
                    <td>{{ \App\Services\Mediclaim\Support\IndianCurrencyFormatter::format($claim->total_claimed_amount) }}</td>
                    <td>{{ \App\Services\Mediclaim\Support\IndianCurrencyFormatter::format($claim->total_approved_amount) }}</td>
                    <td>{{ \App\Services\Mediclaim\Support\IndianCurrencyFormatter::format($claim->total_disallowed_amount) }}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Section F - Supporting Documents</div>
        <table class="data">
            <thead>
                <tr>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Uploaded At</th>
                </tr>
            </thead>
            <tbody>
                @forelse($documentRows as $row)
                    <tr>
                        <td>{{ $row['label'] ?: 'N/A' }}</td>
                        <td>{{ $row['status'] ?: 'N/A' }}</td>
                        <td>{{ $row['version'] ?: 'N/A' }}</td>
                        <td>{{ $row['uploadedAt'] ?: 'N/A' }}</td>
                    </tr>
                @empty
                    <tr><td colspan="4">No supporting documents were attached.</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Section G - Declaration by Employee</div>
        @foreach($declarationStatements as $statement)
            <p class="declaration-text">&bull; {{ $statement }}</p>
        @endforeach
        <table class="fields">
            @foreach($declarationFields as $field)
                <tr>
                    <td class="f-label">{{ $field[0] }}</td>
                    <td class="f-value">{{ $field[1] !== null && $field[1] !== '' ? $field[1] : 'N/A' }}</td>
                </tr>
            @endforeach
        </table>
    </div>

    @foreach($decisionBlocks as $block)
        <div class="decision-block">
            <div class="db-title">{{ $block['heading'] }}</div>
            @if($block['decision'] === null)
                <div class="db-pending">Not yet recorded.</div>
            @else
                <table class="fields">
                    <tr>
                        <td class="f-label">Decision</td>
                        <td class="f-value">{{ $block['decision'] }}</td>
                    </tr>
                    @foreach($block['extra'] as $extraField)
                        <tr>
                            <td class="f-label">{{ $extraField[0] }}</td>
                            <td class="f-value">{{ $extraField[1] }}</td>
                        </tr>
                    @endforeach
                    <tr>
                        <td class="f-label">Remarks</td>
                        <td class="f-value">{{ $block['remarks'] ?: 'N/A' }}</td>
                    </tr>
                    <tr>
                        <td class="f-label">Decided By</td>
                        <td class="f-value">{{ $block['decidedBy'] ?: 'N/A' }}</td>
                    </tr>
                    <tr>
                        <td class="f-label">Decided At</td>
                        <td class="f-value">{{ $block['decidedAt'] ?: 'N/A' }}</td>
                    </tr>
                </table>
            @endif
        </div>
    @endforeach

    <div class="footer-note">
        System-generated final claim-form record for claim {{ $claim->claim_number ?: ('#' . $claim->id) }}, produced
        {{ now()->format('d-M-Y H:i') }}. This document reflects the claim and decision data recorded in the system at
        the time of generation and is not itself an editable form.
    </div>
</body>
</html>
