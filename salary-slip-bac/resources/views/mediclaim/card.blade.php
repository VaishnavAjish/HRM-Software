<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Mediclaim Card</title>
<style>
    {{--
        dompdf-targeted CSS: table-based layout (no flexbox/grid — dompdf's
        support for both is unreliable), inline-safe units, no external
        fonts/assets. Rendered via
        Pdf::loadView('mediclaim.card', [...])->setPaper('a6', 'landscape')
        from MediclaimCardService — A6 landscape (148mm x 105mm) chosen over a
        literal wallet/CR80 card size (~86mm x 54mm) because the field list
        this phase requires (company, employee, member, policy, validity,
        floater limit, hospital list, coordinator contact, emergency
        instructions, verification block) does not fit legibly at true
        wallet-card size; A6 is still small enough to print/laminate as a
        card while leaving room for everything the plan asks for.
    --}}
    * { box-sizing: border-box; }
    body {
        margin: 0;
        padding: 5mm 6mm;
        font-family: Helvetica, Arial, sans-serif;
        font-size: 8pt;
        color: #1f2937;
    }
    .card {
        border: 1.5pt solid #1d4ed8;
        border-radius: 4pt;
        padding: 4mm 5mm;
    }
    .header {
        border-bottom: 1pt solid #cbd5e1;
        padding-bottom: 2.5mm;
        margin-bottom: 2.5mm;
        overflow: hidden;
    }
    .policy-no {
        float: right;
        font-size: 7.5pt;
        color: #475569;
    }
    .company-name {
        font-size: 12pt;
        font-weight: bold;
        color: #1d4ed8;
        margin: 0;
    }
    .doc-title {
        font-size: 7.5pt;
        letter-spacing: 0.4pt;
        text-transform: uppercase;
        color: #475569;
    }
    table.layout {
        width: 100%;
        border-collapse: collapse;
    }
    table.layout > tbody > tr > td {
        vertical-align: top;
    }
    .col-left {
        width: 58%;
        padding-right: 4mm;
    }
    .col-right {
        width: 42%;
        border-left: 0.75pt solid #e2e8f0;
        padding-left: 4mm;
    }
    .field {
        margin-bottom: 2mm;
    }
    .label {
        font-size: 6pt;
        text-transform: uppercase;
        letter-spacing: 0.3pt;
        color: #64748b;
    }
    .value {
        font-size: 9pt;
        font-weight: bold;
        color: #111827;
    }
    .section-title {
        font-size: 6.5pt;
        font-weight: bold;
        text-transform: uppercase;
        color: #1d4ed8;
        margin: 0 0 1.5mm;
    }
    ul.hospital-list {
        margin: 0 0 3mm;
        padding: 0 0 0 3mm;
        font-size: 7pt;
    }
    ul.hospital-list li {
        margin-bottom: 1mm;
    }
    .verify-box {
        border: 0.75pt dashed #94a3b8;
        padding: 2mm;
        font-size: 6pt;
        color: #334155;
        word-break: break-all;
        margin-bottom: 2.5mm;
        line-height: 1.35;
    }
    .verify-box .verify-label {
        display: block;
        font-weight: bold;
        color: #1d4ed8;
        text-transform: uppercase;
        font-size: 5.5pt;
        margin-bottom: 1mm;
    }
    .emergency {
        margin-top: 2.5mm;
        border-top: 1pt solid #cbd5e1;
        padding-top: 2mm;
        font-size: 6pt;
        color: #991b1b;
        line-height: 1.35;
    }
    .emergency strong {
        text-transform: uppercase;
    }
</style>
</head>
<body>
    <div class="card">
        <div class="header">
            <span class="policy-no">Policy No: {{ $policyNumberMasked ?: 'N/A' }}</span>
            <p class="company-name">{{ $companyName ?: 'Mediclaim' }}</p>
            <div class="doc-title">Employee Mediclaim Insurance Card</div>
        </div>

        <table class="layout">
            <tr>
                <td class="col-left">
                    <div class="field">
                        <div class="label">Employee</div>
                        <div class="value">
                            {{ $employee->name }}
                            @if(!empty($employee->emp_code))
                                ({{ $employee->emp_code }})
                            @endif
                        </div>
                    </div>
                    <div class="field">
                        <div class="label">Covered Member</div>
                        <div class="value">{{ $member->full_name }} &mdash; {{ ucfirst($member->relationship_type) }}</div>
                    </div>
                    <div class="field">
                        <div class="label">Member ID</div>
                        <div class="value">{{ $memberNumberMasked ?: 'N/A' }}</div>
                    </div>
                    <div class="field">
                        <div class="label">Valid From &ndash; Valid To</div>
                        <div class="value">
                            {{ $card->valid_from ? $card->valid_from->format('d-M-Y') : 'N/A' }}
                            &ndash;
                            {{ $card->valid_to ? $card->valid_to->format('d-M-Y') : 'Until active' }}
                        </div>
                    </div>
                    <div class="field">
                        <div class="label">Family Floater Limit</div>
                        <div class="value">{{ $floaterLimitFormatted }}</div>
                    </div>
                </td>
                <td class="col-right">
                    <div class="section-title">Approved Hospitals</div>
                    <ul class="hospital-list">
                        @forelse($hospitals as $hospital)
                            <li>{{ $hospital['name'] }}@if(!empty($hospital['city'])), {{ $hospital['city'] }}@endif</li>
                        @empty
                            <li>See the Mediclaim Coordinator for the current network hospital list.</li>
                        @endforelse
                    </ul>

                    <div class="section-title">Coordinator / Office Contact</div>
                    <div class="field">
                        <div class="value" style="font-size:7.5pt;">
                            {{ $contact->designation ?? 'Mediclaim Coordinator' }}
                            @if(!empty($contact->phone))
                                <br>{{ $contact->phone }}
                            @endif
                        </div>
                    </div>

                    <div class="verify-box">
                        <span class="verify-label">Card Verification</span>
                        {{--
                            JUDGMENT CALL — no QR-image library (e.g.
                            chillerlan/php-qrcode, endroid/qr-code,
                            bacon/bacon-qr-code) is present in composer.json,
                            and dompdf itself is not installed yet either, so
                            there is no in-process way to rasterise/vectorise
                            a scannable QR code without adding a new
                            dependency this phase is explicitly told not to
                            add. A third-party QR-image HTTP API was
                            considered and deliberately rejected: it would
                            leak this card's live verification token to an
                            external service and require outbound internet
                            access from wherever PDFs are rendered, neither
                            of which is acceptable for a security-relevant
                            token. The full verify URL below already fully
                            reconstructs the plaintext token, so nothing is
                            lost functionally — it is only less convenient
                            than a phone-camera scan. When a QR-image
                            dependency is approved, this block is the only
                            place that needs to change.
                        --}}
                        Verify online:<br>
                        @if($verifyUrl)
                            {{ $verifyUrl }}
                        @else
                            Frontend URL is not configured — ask HR/Mediclaim desk to verify this card, or configure FRONTEND_URL.
                        @endif
                    </div>
                </td>
            </tr>
        </table>

        <div class="emergency">
            <strong>In an emergency:</strong> Proceed to the nearest approved hospital listed above and present this card at
            admission. If admitted at a non-network hospital, inform the Mediclaim Coordinator within 24 hours. This card does
            not by itself guarantee cashless treatment — always carry a valid photo ID alongside it.
        </div>
    </div>
</body>
</html>
